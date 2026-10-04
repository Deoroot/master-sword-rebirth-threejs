// QUÉ CONTENEDOR RECIBE CADA OBJETO, Y CUÁNTO CABE — el 98.
//
// Hasta el 97 este puerto no repartía: todo lo suelto se veía en el primer
// contenedor, y `FindPackForItem` se portaba sólo para el TEXTO del mensaje.
// Así que «You put Blood Drinker in Heavy Weapon Holster» salía en pantalla y
// era falso: el Heavy Weapon Holster sólo acepta `axes;blunt`
// (sheath_belt_holster.script:10), y en el juego la espada va a la Back Sword
// Sheath. Ver doc/INVENTARIO_98.md.
//
// ── LAS TRES PIEZAS DEL MOTOR ──────────────────────────────────────────────
//
//   `CGenericItem::FindPackForItem`   genericitem.cpp:1154-1197   CUÁL
//   `CGenericItem::CanPutInPack`      genericitem.cpp:1231-1240   y si es hechizo, ninguno
//   `Container_CanAcceptItem`         gipack.cpp:247-331          SI CABE
//
// Y lo que el contenedor declara lo lee `RegisterContainer` (gipack.cpp:50-77):
// tope de objetos y dos máscaras. **No hay volumen**: `reg.container.space`
// está comentado (:57-60) y el `CONTAINER_SPACE` de los 22 contenedores no lo
// lee nadie. Tampoco hay peso: el peso es del JUGADOR, no del contenedor. El
// catálogo lo trae horneado en `ficha.contenedor` (src/bsp/script.js,
// `reglaDeContenedor`), y el intérprete lo calcula igual al correr
// `registercontainer` (src/play/guion.js); una prueba compara los dos.
//
// ── LA FORMA DEL DOCUMENTO ─────────────────────────────────────────────────
//
// En el motor un objeto guardado tiene `m_pParentContainer` (gipack.cpp:372) y
// la lista del contenedor lo tiene a él. Aquí es un campo de la entrada de
// `personaje.objetos`: `en`, la clave del contenedor (su `uid ?? id`). Lo
// puesto no lleva `en` (está en el cuerpo) y los contenedores tampoco (son la
// columna). Una entrada sin `en` es una que nadie ha colocado todavía —un
// documento de antes del 98, o algo que entró por una puerta que no sabe de
// contenedores (el suelo, la tienda, un `offer`)— y `colocar` le busca sitio
// con la misma regla de `PutInAnyPack`, en el orden de la lista.
//
// ── LO QUE NO SE PORTA AQUÍ, dicho ─────────────────────────────────────────
//
//   - COGER VA PRIMERO A LA MANO. `GetAnyItems` -> `GiveTo(this)` ->
//     `NewItemHand`, y sólo con las manos llenas `PutInAnyPack`
//     (genericitem.cpp:908-923, player.cpp:5221). Este puerto sigue metiendo
//     lo cogido en la lista (el 71); desde el 98, en el contenedor que el motor
//     elegiría con las manos llenas.
//   - UN OBJETO QUE NO CABE EN NINGUNO. En el motor no puede existir: se
//     queda en la mano o en el suelo. Aquí puede, porque `colocar` llega
//     tarde (lo que trae la herramienta de Veteran, lo comprado): se queda sin
//     `en` y `sinSitio` lo dice. El panel lo enseña en el primer contenedor,
//     como hasta el 97, y la prueba lo cuenta.
//   - Los montones de varios de lo que NO es agrupable (el suelo de este puerto
//     apila todo, `cogerDelSuelo`): ocupan `n` plazas, y entran enteros o no.

/** Las reglas de un contenedor, o `null` si no lo es. */
export function reglaDe(ficha) {
  if (!ficha || ficha.tipo !== "contenedor") return null;
  return ficha.contenedor ?? { maximo: 0, acepta: [], rechaza: [] };
}

/** La clave con la que se nombra una entrada de la lista. */
export const claveDe = (o) => o?.uid ?? o?.id ?? null;

/** Cuántas plazas ocupa una entrada: un montón agrupable es UNA entidad. */
const plazas = (o, fichaDe) => (fichaDe(o.id)?.apilable ? 1 : Math.max(1, o.n ?? 1));

/**
 * Los contenedores que lleva, en el orden de `Gear` (que aquí es el de la
 * lista). `PutInAnyPack` cuenta sólo los que NO están en la mano
 * (playershared.cpp:710-717); en este puerto un contenedor nunca está en la
 * mano («Removing a container is not in this port yet»).
 */
export function contenedoresDe(p, fichaDe) {
  return (p?.objetos ?? [])
    .filter((o) => reglaDe(fichaDe(o.id)))
    .map((o) => ({ clave: claveDe(o), id: o.id, nombre: fichaDe(o.id)?.nombre ?? o.id, regla: reglaDe(fichaDe(o.id)) }));
}

/** Lo que hay dentro de un contenedor: las entradas con su `en`. */
export function dentroDe(p, clave) {
  return (p?.objetos ?? []).filter((o) => o.en === clave && !o.puesto);
}

/**
 * `Container_CanAcceptItem` — gipack.cpp:247-331, en su orden:
 *
 *   1. `if (!PackData || !pItem || pItem == this) return false;`
 *   2. EL TOPE (`MaxItems`, :254): lleno, sólo entra un agrupable que tenga ya
 *      un montón del MISMO guion dentro — y entonces `return true` SIN mirar
 *      las máscaras (:258-283). Un tope 0 es «sin tope».
 *   3. Las máscaras, por SUBCADENA del nombre del guion (`strstr`, :299 y :315):
 *      `reject` «all» rechaza todo; si hay `accept`, **manda ella** y el
 *      `reject` no cuenta (:308-310, «This accept overrules a reject»).
 *   4. `ItemExists` (genericitem.cpp... genitemlist.cpp:9-11): si ya está ahí,
 *      no. Es lo que hace que llevar algo al contenedor en el que ya está diga
 *      «can't fit».
 *
 * @param caja    `{ clave, regla }` de `contenedoresDe`
 * @param entrada la entrada que se quiere meter (`{ id, n, en? }`)
 */
export function cabe(p, caja, entrada, fichaDe) {
  const r = caja?.regla;
  if (!r || !entrada) return false;
  if (claveDe(entrada) === caja.clave) return false;                  // `pItem == this`
  const nombre = String(entrada.id);
  const ya = dentroDe(p, caja.clave).filter((o) => o !== entrada);
  if (r.maximo) {
    const usadas = ya.reduce((s, o) => s + plazas(o, fichaDe), 0);
    if (usadas + plazas(entrada, fichaDe) > r.maximo) {
      // «MiB FEB2010_13»: lleno, pero agrupable y con su montón dentro.
      if (fichaDe(entrada.id)?.apilable && ya.some((o) => o.id === entrada.id && fichaDe(o.id)?.apilable)) return true;
      return false;
    }
  }
  let acepta = true;
  if (r.rechaza.length) {
    if (r.rechaza[0] === "all") acepta = false;
    else if (r.rechaza.some((t) => nombre.includes(t))) acepta = false;
  }
  if (r.acepta.length) acepta = r.acepta.some((t) => nombre.includes(t));
  if (!acepta) return false;
  // `CItemList::CanAddItem` -> `ItemExists` (genitemlist.cpp:4-14).
  if (entrada.en === caja.clave && (p?.objetos ?? []).includes(entrada)) return false;
  return true;
}

/** `CanPutInPack` (genericitem.cpp:1231-1240): un hechizo no entra en ninguno. */
export function puedeGuardarseEn(p, caja, entrada, fichaDe) {
  if (fichaDe(entrada?.id)?.tipo === "hechizo") return false;
  return cabe(p, caja, entrada, fichaDe);
}

/**
 * `FindPackForItem` — genericitem.cpp:1154-1197. Primero el que pide el NOMBRE
 * (`arrow` -> un id con «quiver», `swords` -> «sheath», `blunt`/`axes` ->
 * «holster», con `GetContainer(subcadena)`, msmonstershared.cpp:90-96, que
 * devuelve el PRIMERO aunque no quepa); si ése no lo admite, el primero de
 * `Gear` que lo admita. `null` si ninguno.
 *
 * Fíjate en la trampa de la subcadena: `sheath_belt_holster` lleva «sheath» en
 * el nombre, así que para una espada el «primer contenedor con sheath» de un
 * personaje nuevo es el Heavy Weapon Holster —que no acepta espadas— y la
 * espada acaba en la segunda vuelta, en la Back Sword Sheath.
 */
export function buscarContenedor(p, entrada, fichaDe) {
  const cajas = contenedoresDe(p, fichaDe);
  const id = String(entrada.id);
  const porNombre = (sub) => cajas.find((c) => String(c.id).includes(sub)) ?? null;
  let pedida = null;
  if (id.includes("arrow")) pedida = porNombre("quiver");
  else if (id.includes("swords")) pedida = porNombre("sheath");
  else if (id.includes("blunt") || id.includes("axes")) pedida = porNombre("holster");
  if (pedida && puedeGuardarseEn(p, pedida, entrada, fichaDe)) return pedida;
  return cajas.find((c) => puedeGuardarseEn(p, c, entrada, fichaDe)) ?? null;
}

/**
 * `PutInAnyPack` — playershared.cpp:706-733: con UN solo contenedor se va a
 * él sin buscar (y `PutInPack` dirá que no cabe si no cabe); con más, el de
 * `FindPackForItem`. Devuelve `{ caja, sola }`: `sola` es que había uno y se
 * intentó ése, que cambia el mensaje del fallo.
 */
export function contenedorParaGuardar(p, entrada, fichaDe) {
  const cajas = contenedoresDe(p, fichaDe);
  if (cajas.length === 1) return { caja: cajas[0], sola: true };
  return { caja: buscarContenedor(p, entrada, fichaDe), sola: false };
}

/**
 * El mensaje de `CBasePlayer::PutInPack` cuando no cabe (playershared.cpp:
 * 676-688): una de DOS frases, a cara o cruz (`RANDOM_LONG(0, 1)`), con
 * `SendInfoMsg`. Los hechizos se callan.
 */
export function noCabeTexto(nombreObjeto, nombreCaja, azar = Math.random) {
  // `if (!RANDOM_LONG(0, 1))` — el 0 es la primera.
  return Math.floor(azar() * 2) === 0
    ? `Your ${nombreCaja} can't fit that!`
    : `You try to stuff ${nombreObjeto} into your ${nombreCaja}, but to no avail.`;
}

/**
 * COLOCAR lo que no tiene sitio. Para cada entrada sin `en` (y que ni está
 * puesta ni es un contenedor), en el orden de la lista, el contenedor de
 * `PutInAnyPack`. Lo que no cabe en ninguno se queda sin `en` y se devuelve.
 * Se llama antes de enseñar el panel y antes de cada orden: es idempotente.
 *
 * Y una entrada cuyo `en` ya no nombra a ningún contenedor que lleve (lo
 * vendió, por ejemplo) se vuelve a colocar.
 */
export function colocar(p, fichaDe) {
  const cajas = new Set(contenedoresDe(p, fichaDe).map((c) => c.clave));
  const sinSitio = [];
  for (const o of p?.objetos ?? []) {
    if (o.puesto || reglaDe(fichaDe(o.id))) { delete o.en; continue; }
    if (o.en !== undefined && cajas.has(o.en)) continue;
    delete o.en;
    const { caja } = contenedorParaGuardar(p, o, fichaDe);
    if (caja && puedeGuardarseEn(p, caja, o, fichaDe)) o.en = caja.clave;
    else sinSitio.push(o);
  }
  return sinSitio;
}
