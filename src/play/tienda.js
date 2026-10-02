// LAS TIENDAS: `CStore`, y los cuatro comandos que las manejan.
//
// El armero y el vendedor de Gate City son tiendas, y las tiendas son la
// respuesta más directa a «los goblins pegan demasiado para un personaje
// nuevo»: comprar una armadura y un arma mejor es como sobrevive un jugador.
//
// Los comandos están en `npcscript.cpp` y son cuatro, con alias viejo cada uno:
//
//   npcstore.create  <tienda>                                          :739
//   npcstore.additem <tienda> <objeto> [cant] [coste%] [venta] [lote]  :755
//     (alias: `addstoreitem`, que es el que usan todos los guiones)
//   npcstore.offer   <tienda> <a quién> <flags> <retrollamada>         :829
//   npcstore.remove  <tienda> [allitems | item <objeto>]               :900
//
// ── Lo que no se adivina, y son cinco cosas ───────────────────────────────
//
// 1. **Las tiendas son GLOBALES por nombre, no del NPC.** `GetStoreByName`
//    busca en una lista estática (`CStore::m_gStores`), y `npcstore.create`
//    sobre un nombre que ya existe **reutiliza la que hay** en vez de crear
//    otra. Por eso los guiones empiezan con `npcstore.remove STORE_NAME
//    allitems`: si no vaciaran, el inventario del vendedor crecería cada vez
//    que alguien le habla.
//
// 2. **El coste es un PORCENTAJE, no un precio.** `addstoreitem ... 125 ...`
//    no son 125 monedas: es el 125 % del valor del objeto
//    (`iRealCost = int(pItem->m_Value * (iCost/100.0))`, :802). El armero de
//    Gate City vende la armadura de cuero al 125 % y la dorada al 100 %.
//
// 3. **El ratio de recompra está topado a 0,9.** `V_min(atof(Params[4]), .9)`
//    (:843, «MIB JAN2010_16 - cap resell values»). Un guion que pida 1.0 se
//    queda en 0,9, y eso importa: al 1.0 se podría comprar y revender sin
//    perder nada.
//
// 4. **`npcstore.offer` necesita CUATRO parámetros en la práctica.** La rama
//    pide `>= 3` y con exactamente tres lee los flags del hueco del destino
//    (`BuyFlags = Params[1]`, que es el objetivo). Con cuatro reasigna bien.
//    Todos los guiones de Gate City usan cuatro.
//
// 5. **`inv` no se suma a los otros flags: los BORRA.** `if (strstr(BuyFlags,
//    "inv")) iBuyFlags = STORE_INV;` — es una asignación, no un `SetBits`
//    como las dos de arriba (:868-870). Una tienda pedida con «buy;inv» no
//    deja comprar.
//
// ── Lo que este módulo NO hace ────────────────────────────────────────────
//
// **No dibuja la tienda.** `Offer` abre un panel de VGUI que aquí no existe
// todavía. Esto es el modelo y las reglas —qué hay, a cuánto, y qué pasa al
// ofrecerla—, y `ofrecer()` devuelve lo que habría que enseñar. Lo que decide
// si se ve es `src/play/npcguion.js`, y hoy dice que no.

/** `NUM_MAX_ITEMS`, el tope duro del inventario. genericitem.h. */
export const MAX_OBJETOS = 50;

/** El tope de recompra. `V_min(atof(Params[4]), .9)`, npcscript.cpp:843. */
export const RATIO_MAXIMO = 0.9;

/** Lo que valen los parámetros que no se pasan. npcscript.cpp:772-774. */
export const POR_DEFECTO = { cantidad: 1, coste: 100, ratio: 0.25, lote: 0 };

/** Los bits de `iBuyFlags`. npcscript.cpp:866-870. */
export const COMPRAR = 1, VENDER = 2, INVENTARIO = 4;

/**
 * Los flags de una oferta, a partir del texto del guion.
 *
 * Los dos primeros se SUMAN (`SetBits`) y el tercero **asigna**: una tienda
 * pedida con «buy;inv» acaba siendo sólo inventario y no deja comprar. Es lo
 * que dice el motor y va portado.
 */
export function flagsDe(texto) {
  const s = String(texto ?? "");
  let f = 0;
  if (s.includes("buy")) f |= COMPRAR;
  if (s.includes("sell")) f |= VENDER;
  if (s.includes("inv")) f = INVENTARIO;   // asignación, no `|=`. :870
  return f;
}

/**
 * El precio de una unidad: un PORCENTAJE del valor del objeto.
 *
 * `iRealCost = int(pItem->m_Value * (iCost/100.0))` — npcscript.cpp:802. El
 * guardia contra el desbordamiento de :800 no se porta como tal: aquí no hay
 * enteros de 32 bits que den la vuelta. Se deja el `Math.trunc`, que es lo que
 * hace el `int(...)` y lo que redondea los precios hacia abajo.
 */
export function precioDe(valor, costePorCiento) {
  const v = Number(valor) || 0;
  if (!v) return 0;                       // `if (pItem->m_Value)`: sin valor, 0
  return Math.trunc(v * (Number(costePorCiento) / 100));
}

/**
 * UNA TIENDA. `CStore`.
 *
 * El catálogo se inyecta —una función `id -> ficha`— por lo de siempre: esto
 * corre igual en Node y en el navegador y no importa nada.
 */
export class Tienda {
  constructor(nombre) {
    this.nombre = String(nombre);
    /** `m_Items`. Lo que hay a la venta. */
    this.objetos = [];
    /** `Deactivate()`: `npcstore.remove <tienda>` sin más la apaga. */
    this.activa = true;
  }

  /**
   * `CStore::AddItem`, por la vía de `addstoreitem`. npcscript.cpp:755-821.
   *
   * Devuelve la línea añadida, o `null` si el objeto no existe — que es lo que
   * hace el motor: se queja por la consola de errores («non-existant item») y
   * **no añade nada**. Callarlo aquí sería inventarse una tienda que en el
   * juego estaría vacía.
   */
  anadir(ficha, { cantidad, coste, ratio, lote } = {}) {
    if (!ficha) return null;
    const linea = {
      id: ficha.id,
      cantidad: cantidad ?? POR_DEFECTO.cantidad,
      // El porcentaje se guarda además del precio: el guion razona en
      // porcentaje y enseñarlo ayuda a ver de dónde sale la cifra.
      coste: coste ?? POR_DEFECTO.coste,
      precio: precioDe(ficha.valor, coste ?? POR_DEFECTO.coste),
      // El tope de 0,9, aquí y no en quien llama, para que no se pueda saltar.
      ratio: Math.min(ratio ?? POR_DEFECTO.ratio, RATIO_MAXIMO),
      // `if (FBitSet(..., ITEM_GROUPABLE) && !iBundleAmt) iBundleAmt =
      // pItem->iMaxGroupable;` (:809). `iMaxGroupable` NO está en el catálogo
      // que hornea `npm run objetos`, así que el relleno automático no se
      // puede hacer: se queda el que pida el guion. Y hoy da igual, porque
      // `apilable` sale false en los 760 objetos.
      lote: lote ?? POR_DEFECTO.lote,
    };
    this.objetos.push(linea);
    return linea;
  }

  /** `GetItem(<nombre>)`: la primera línea con ese objeto, o `null`. */
  linea(id) { return this.objetos.find((o) => o.id === id) ?? null; }

  /** `RemoveAllItems()`. */
  vaciar() { this.objetos.length = 0; }

  /** `RemoveItem(<id>)`: se va **la primera** que coincida. */
  quitar(id) {
    const i = this.objetos.findIndex((o) => o.id === id);
    if (i >= 0) this.objetos.splice(i, 1);
    return i >= 0;
  }
}

/**
 * LA LISTA GLOBAL DE TIENDAS. `CStore::m_gStores`.
 *
 * Es un objeto y no un módulo con estado suelto para que las pruebas puedan
 * tener la suya y no se pisen entre ellas.
 */
export class Tiendas {
  constructor() { this.porNombre = new Map(); }

  /** `GetStoreByName`. */
  buscar(nombre) { return this.porNombre.get(String(nombre)) ?? null; }

  /**
   * `npcstore.create`. Si ya hay una con ese nombre **la devuelve**, no crea
   * otra: `if (!NewStore) NewStore = m_gStores.add(new CStore)` (:744-746).
   */
  crear(nombre) {
    const ya = this.buscar(nombre);
    if (ya) { ya.activa = true; return ya; }
    const t = new Tienda(nombre);
    this.porNombre.set(t.nombre, t);
    return t;
  }

  /**
   * `npcstore.offer`. Decide QUÉ pasa, no lo dibuja.
   *
   * Devuelve `{ que, tienda, flags, evento }`, donde `que` es uno de
   * «abre», «llena», «sin tienda» u «ocupado», y `evento` es la retrollamada
   * que hay que llamar: el motor añade el sufijo él mismo —`_success`,
   * `_fail`, `_busy` (:886-893)— y aquí va ya compuesto.
   */
  ofrecer(nombreTienda, { flags = 0, retrollamada = "", objetosDelJugador = 0, comerciando = false } = {}) {
    const sufijo = (s) => (retrollamada ? `${retrollamada}_${s}` : null);
    // `if (!HasConditions(MONSTER_TRADING))` (:874): un NPC que ya está
    // comerciando con otro **no abre nada** y avisa por `_busy`.
    if (comerciando) return { que: "ocupado", tienda: null, flags, evento: sufijo("busy") };
    const tienda = this.buscar(nombreTienda);
    // `pPlayer->NumItems() >= NUM_MAX_ITEMS` (:847). El aviso es literal.
    const llena = objetosDelJugador >= MAX_OBJETOS;
    if (llena) return { que: "llena", tienda: null, flags, evento: sufijo("fail"), aviso: "Cannot use stores/chests while inventory full." };
    if (!tienda) return { que: "sin tienda", tienda: null, flags, evento: sufijo("fail") };
    return { que: "abre", tienda, flags, evento: sufijo("success") };
  }
}

// ── COMPRAR Y VENDER (60) ───────────────────────────────────────────────────
//
// Hasta el 60 este archivo era el catálogo y nada más: qué hay, a cuánto, y
// qué pasa al OFRECER la tienda. Lo que pasaba al pulsar un objeto no existía,
// y por eso el README decía «you cannot buy yet».
//
// El comercio son DOS `TradeItem` que se llaman en cadena, y eso importa
// porque cada uno rechaza por su cuenta y con su propio silencio:
//
//   `CBasePlayer::TradeItem`   el cliente. player.cpp:5806-5990.
//   `CMSMonster::TradeItem`    el vendedor, llamado desde el de arriba en
//                              :5899. msmonsterserver.cpp:1861-1922.
//
// El cliente le pregunta al vendedor —«¿me lo vendes?»— y el vendedor contesta
// con un `tradeinfo_t` o con `NULL`. **Un `NULL` del vendedor no dice nada por
// pantalla**: el comercio se acaba en silencio. Los avisos que el jugador ve
// son todos del lado del cliente, y son tres.
//
// ── El orden de las comprobaciones, que es lo que se ve ───────────────────
//
// No es el orden que uno escribiría. Al comprar:
//
//   1. (vendedor) la línea existe y `Quantity >= iBundleAmt`  -> si no, SILENCIO
//   2. (cliente)  ¿cabe en la mano o en la mochila?           -> sin aviso propio
//   3. (cliente)  `m_Gold < iPrice`   «You can't afford X.»   -> rojo
//   4. (cliente)  `Quantity <= 0`     «Vendor out of item: X.»-> rojo
//   5. (cliente)  se entrega: «You receive X.»                -> consola
//
// El 4 parece repetir al 1 y no lo es: es un parche con fecha —«Thothie
// DEC2012_16 - fix exploit where player could get infinite items by repeating
// console buy command»— y va **después** del dinero, así que un jugador sin
// oro delante de una tienda agotada oye «no te lo puedes permitir» y no «no
// queda». Va portado con el orden.
//
// ── Y `iBundleAmt` por omisión vale CERO, que es la trampa ────────────────
//
// `POR_DEFECTO.lote` es 0 (npcscript.cpp:772-774), o sea que casi ninguna
// línea de tienda declara lote. Y entonces:
//
//   - el guardia del paso 1 es `Quantity >= 0`, que **siempre se cumple**;
//     quien de verdad para la venta con el estante vacío es el paso 4;
//   - el objeto entregado sale con `iQuantity = iBundleAmt`, o sea 0;
//   - pero lo que se descuenta es `V_max(pItem->iQuantity, 1)`, o sea 1.
//
// Se porta tal cual. Un lote de cero no es «ninguno»: es «uno, y el contador
// lo arregla al final».

/** Los tres avisos del cliente, literales. player.cpp:5915, 5925, 5932, 5977. */
export const NO_TE_LO_PUEDES_PERMITIR = (nombre) => `You can't afford ${nombre}.`;
export const NO_LE_QUEDAN = (nombre) => `Vendor out of item: ${nombre}.`;
export const LO_RECIBES = (nombre) => `You receive ${nombre}.`;
export const LO_VENDES = (nombre, oro) => `You sell ${nombre} for ${oro} gold.`;

/**
 * COMPRAR una línea de la tienda. `trade buy <nombre>`.
 *
 * `oro` es el del jugador y no se toca: esto DECIDE y devuelve qué hacer, y
 * quien tenga el personaje lo aplica. Es la misma frontera que el resto de
 * `src/play/`: aquí no hay estado del jugador.
 *
 * `cabe` es «¿tiene sitio en la mano o en la mochila?», que en el motor son
 * `NewItemHand` y `CanPutInAnyPack` y aquí no se pueden resolver sin el
 * inventario. Se pasa ya resuelto, y su valor por omisión es `true` porque la
 * falta de sitio es el caso raro — y porque un `false` por omisión escondería
 * el resto de la regla detrás de un rechazo.
 *
 * Devuelve `{ que, ... }` con `que` en:
 *   «no la tiene»   el vendedor dijo que no. Sin aviso: es el silencio de :1900
 *   «no cabe»       sin sitio. El motor no imprime nada aquí tampoco
 *   «sin oro»       con su aviso
 *   «agotado»       con el suyo
 *   «compra»        con el precio, cuánto se entrega y cuánto baja el estante
 */
export function comprar(tienda, id, { oro = 0, cabe = true, nombre = null } = {}) {
  const linea = tienda?.linea?.(id) ?? null;
  const como = nombre ?? id;
  // (1) El vendedor. `GetItem(...) && Quantity >= iBundleAmt`, :1890-1900.
  if (!linea || linea.cantidad < linea.lote) return { que: "no la tiene", aviso: null };
  // Lo que se entrega: `pItem->iQuantity = psiStoreItem->iBundleAmt`, :1895.
  const entregadas = linea.lote;
  const precio = linea.precio;
  // (2) El sitio. `NewItemHand(...) < 0 && !CanPutInAnyPack(...)`, :5911-5913.
  // Sin aviso propio: los que hay los imprime `NewItemHand` con su `verbose`.
  if (!cabe) return { que: "no cabe", aviso: null, precio };
  // (3) El dinero, ANTES que el estante. :5914-5918.
  if (oro < precio) return { que: "sin oro", aviso: NO_TE_LO_PUEDES_PERMITIR(como), precio };
  // (4) Y el estante, después. El parche de DEC2012_16. :5921-5928.
  if (linea.cantidad <= 0) return { que: "agotado", aviso: NO_LE_QUEDAN(como), precio };
  // (5) `Quantity -= V_max(pItem->iQuantity, 1)`, :5935.
  return {
    que: "compra",
    aviso: LO_RECIBES(como),
    precio,
    entregadas,
    descuenta: Math.max(entregadas, 1),
    // Los dos eventos que el motor manda al cerrar la venta, :5940-5949. No se
    // llaman aquí —esto no conoce guiones— pero se dicen, porque un guion que
    // los espera y no los recibe es un NPC que se queda a medias.
    eventos: [
      { a: "jugador", nombre: "game_player_got_from_store" },
      { a: "vendedor", nombre: "game_gave_player" },
    ],
  };
}

/**
 * VENDER un objeto al vendedor. `trade sell <id>`.
 *
 * Dos guardias, los dos del lado del vendedor y los dos en silencio
 * (:1905-1911):
 *
 *   - el objeto tiene que ser **tuyo**. Se comprueba por dueño y no por
 *     nombre, porque el comando manda el ID de la entidad;
 *   - y el vendedor tiene que **tener esa línea en su tienda**. Ésa es la
 *     regla entera de «qué te compran»: lo que él vende, te lo compra. Es lo
 *     que en el panel sale en gris (`InterestedInItem`, vgui_storesell.cpp:80).
 *
 * El precio es `int(iCost * flSellRatio)` — el precio de VENTA del vendedor
 * por su ratio, no el valor del objeto—, así que un objeto que él vende caro
 * te lo paga caro.
 */
export function vender(tienda, id, { esMio = true, nombre = null } = {}) {
  if (!esMio) return { que: "no es tuyo", aviso: null };
  const linea = tienda?.linea?.(id) ?? null;
  if (!linea) return { que: "no la quiere", aviso: null };
  const precio = Math.trunc(linea.precio * linea.ratio);
  return {
    que: "vende",
    aviso: LO_VENDES(nombre ?? id, precio),
    precio,
    // `Quantity += V_max(pItem->iQuantity, 1)`, :5981. Lo que vendes va al
    // estante: la tienda de Master Sword no tiene fondo, tiene existencias.
    suma: 1,
  };
}

/**
 * LO QUE EL PANEL ENSEÑA de una línea, ya en texto.
 *
 * Las dos cadenas son de `titles.txt` y se dejan aquí para que el panel no
 * las invente: `ITEM_COST` es «Cost: %i gold» (:253) y `SELL_ITEM_VALUE` es
 * «Worth: %i gold» (:183). Y el «Worthless» de un objeto que no le interesa
 * NO está en `titles.txt`: es una cadena a pelo en el código
 * (vgui_storesell.cpp:101), y por eso se escribe aquí igual de a pelo.
 */
export const TEXTO_COSTE = (oro) => `Cost: ${oro} gold`;
export const TEXTO_VALOR = (oro) => `Worth: ${oro} gold`;
export const NO_VALE_NADA = "Worthless";

/** «Selling N items for G gold», la etiqueta de abajo. vgui_storesell.cpp:130. */
export const TEXTO_VENDIENDO = (cuantos, oro) => `Selling ${cuantos} items for ${oro} gold`;

/**
 * El título del panel. `"%s's Shop"`, o el nombre a secas si es un contenedor
 * (`STORE_INV`). vgui_storemainwin.cpp:70-74.
 */
export function tituloDeLaTienda(nombreDelVendedor, flags = 0) {
  const n = String(nombreDelVendedor ?? "");
  return (flags & INVENTARIO) ? n : `${n}'s Shop`;
}

/** Los tres subtítulos, de `titles.txt:179, 192, 196`. */
export const SUBTITULO_COMPRAR = "Select an item to buy";
export const SUBTITULO_VENDER = "Select items to sell";
export const SUBTITULO_INVENTARIO = "Select an item to take";

// ── EL VENDEDOR ATIENDE A UNO A LA VEZ — experimento 62 ─────────────────────
//
// Esto es la respuesta del original a «dos personas en el mismo vendedor», y no
// es la que uno supondría. No hay un estante compartido que los dos miran: hay
// **una cola de uno**. Mientras un jugador tiene la tienda abierta, el vendedor
// lleva puesta la condición `MONSTER_TRADING` y el `npcstore.offer` de
// cualquier otro se va por la retrollamada `_busy`:
//
//     if (!HasConditions(MONSTER_TRADING)) { ...abrir la tienda... }
//     else if (m_TradeCallBackEvent.len())
//         CallScriptEvent(UTIL_VarArgs("%s_busy", m_TradeCallBackEvent.c_str()));
//                                                   npcscript.cpp:875-894
//
// Y el trato se marca en LOS DOS, apuntándose el uno al otro:
//
//     pVendor->SetConditions(MONSTER_TRADING); pVendor->m_hEnemy = pPlayer;
//     pPlayer->SetConditions(MONSTER_TRADING); pPlayer->m_hEnemy = pVendor;
//                                                   store.cpp:77-80
//
// Lo cual explica de paso por qué el mod prohíbe el inventario mientras
// comercias (`client.cpp:466`): es la misma condición.
//
// ── Y se acaba andando, no cerrando ────────────────────────────────────────
//
//     void CMSMonster::Trade() {
//         if (!HasConditions(MONSTER_TRADING)) return;
//         if (m_hEnemy != NULL && m_hEnemy->IsAlive()) {
//             CBaseMonster* pEnemy = ...m_hEnemy;
//             if (pEnemy->m_hEnemy == this &&
//                 (pEnemy->Center() - Center()).Length() <= 128) return;
//         }
//         //End trade
//         if (m_TradeCallBackEvent.len()) CallScriptEvent("<cb>_done");
//         ClearConditions(MONSTER_TRADING);
//         m_hEnemy = NULL; OpenStore = NULL;
//     }                                             msmonsterserver.cpp:1835-1856
//
// Tres cosas que se copian porque cambian lo que pasa:
//
//   - la distancia es **`Length()`, en 3D**, al contrario que la del chat, que
//     es `Length2D()`. Aquí la altura sí cuenta;
//   - el trato se rompe también si el cliente **deja de apuntar al vendedor**
//     (`pEnemy->m_hEnemy == this`): hablar con otro te saca de la tienda;
//   - y si el cliente **se muere** delante del vendedor, claro.
//
// Esto corre en el `Think` del NPC, así que el trato no se cierra al pulsar
// nada: se cierra cuando te vas. Por eso un vendedor puede quedarse «ocupado»
// unos instantes después de que el otro haya cerrado el panel.

/** `(pEnemy->Center() - Center()).Length() <= 128` — msmonsterserver.cpp:1843. */
export const CORREA_DE_COMERCIO = 128;

/**
 * Quién está atendiendo a quién. Una por partida.
 *
 * No guarda la tienda: guarda **el trato**. La tienda se busca por nombre en
 * `Tiendas`, que es la lista global (`CStore::m_gStores`); esto es la condición
 * `MONSTER_TRADING` de los dos lados, que en el mod vive en las entidades.
 */
export class Comercio {
  constructor({ correa = CORREA_DE_COMERCIO } = {}) {
    this.correa = correa;
    /** `vendedor -> { cliente, retrollamada }`. */
    this.porVendedor = new Map();
  }

  /** ¿Con quién está este vendedor? `null` si está libre. */
  clienteDe(vendedor) { return this.porVendedor.get(String(vendedor))?.cliente ?? null; }

  /** ¿Está ocupado con ALGUIEN QUE NO SEA éste? Es lo que mira `npcstore.offer`. */
  ocupado(vendedor, cliente = null) {
    const actual = this.clienteDe(vendedor);
    return actual !== null && actual !== cliente;
  }

  /**
   * `CStore::Offer`: se abre el trato y se marcan los dos.
   *
   * Devuelve `false` si ya estaba ocupado con otro, y entonces quien llama
   * tiene que disparar `_busy` — el mod no sobreescribe el trato en curso.
   */
  abrir(vendedor, cliente, { retrollamada = "" } = {}) {
    if (this.ocupado(vendedor, cliente)) return false;
    // SE GUARDA EL VENDEDOR TAL CUAL, ademas de su clave.
    //
    // La clave del `Map` es `String(vendedor)` para que `24` y `"24"` sean el
    // mismo vendedor, y eso esta bien. Lo que NO vale es devolver la clave:
    // quien recibe un `"24"` y lo mete en un `manada.de(id)` que compara con
    // `===` recibe `null`, decide que el cliente no esta, y **cierra el trato
    // en el fotograma siguiente**. Paso: la sonda daba «The vendor is busy» al
    // comprar, con el comprador pegado al vendedor (62).
    this.porVendedor.set(String(vendedor), { cliente, retrollamada, vendedor });
    return true;
  }

  /** Cierra el trato a mano. Devuelve la retrollamada `_done`, o `null`. */
  cerrar(vendedor) {
    const v = String(vendedor);
    const t = this.porVendedor.get(v);
    if (!t) return null;
    this.porVendedor.delete(v);
    return t.retrollamada ? `${t.retrollamada}_done` : null;
  }

  /**
   * El `Think` del vendedor: `CMSMonster::Trade()`.
   *
   * @param {(vendedor:*, cliente:*)=>{distancia:number, vivo:boolean, mirando:boolean}} estado
   *        lo que hace falta saber de cada pareja, y se pregunta en vez de
   *        guardarse: las posiciones cambian y una copia envejece.
   * @returns {Array<{vendedor:*, cliente:*, evento:string|null}>} los tratos
   *        que se han acabado en este paso, con su `_done` a mano.
   */
  paso(estado) {
    const acabados = [];
    for (const [vendedor, t] of [...this.porVendedor]) {
      const e = estado?.(t.vendedor ?? vendedor, t.cliente) ?? null;
      const sigue = Boolean(e) && e.vivo !== false && e.mirando !== false
        && Number(e.distancia ?? Infinity) <= this.correa;
      if (sigue) continue;
      this.porVendedor.delete(vendedor);
      // `t.vendedor` y no `vendedor`: el segundo es la clave del `Map`, o sea
      // una cadena. Ver `abrir`.
      acabados.push({ vendedor: t.vendedor ?? vendedor, cliente: t.cliente, evento: t.retrollamada ? `${t.retrollamada}_done` : null });
    }
    return acabados;
  }
}
