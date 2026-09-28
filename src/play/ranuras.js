// LAS RANURAS RÁPIDAS: ciclar arma/hechizo/munición y las doce teclas.
//
// Portado de `vgui_quickslot.h` (la clase `VGUI_QuickSlot`, 376 líneas), de
// `GetItemInInventory` (msmonstershared.cpp:230) y de los enganches de
// `vgui_hud.cpp:499-540`. Aquí no hay DOM ni Three: sólo la regla.
//
// ── Lo primero: la tecla no es la acción ──────────────────────────────────
//
// El `1` no está en el código del juego. Está en un `bind`, y por eso vive en
// `src/juego/teclas.js` como valor por defecto y no aquí. Lo que el motor
// engancha son CINCO comandos (hud.cpp:265-267):
//
//   quickslot weapon|spell|arrow    un comando con argumento, no tres
//   +quickslot N / -quickslot N     la misma tecla, pulsar y soltar
//
// Y el reparto por defecto (`gfx/shell/kb_def.lst`) no es el que uno supone:
//
//   "1" "quickslot weapon"     "3" "inventory"      ← la 3 NO es munición
//   "2" "quickslot spell"      "4" "quickslot arrow"
//   "i" "inventory"            "6".."0" "+quickslot 1".."5"
//   "F1".."F12" "+quickslot 1".."12"
//
// O sea que la munición es la **4**, la 3 abre el inventario, y las ranuras
// están además en el 6, 7, 8, 9 y 0 —las cinco primeras, dos veces—. Todo eso
// es configuración, y cualquiera lo tiene cambiado.
//
// ── Y hay 36 ranuras, no 12 ───────────────────────────────────────────────
//
// `#define MAX_QUICKSLOTS 36` (player.h:102, «MiB MAR2012 - Increase
// quickslots»), con doce teclas. Se llega a las 36 con dos alias que el juego
// trae hechos y que `kb_act.lst` documenta:
//
//   "+shift_slots1"    "Shift Quickslots +12"
//   "+shift_slots2"    "Shift Quickslots +24"
//
// Son un DESPLAZAMIENTO mantenido, como las mayúsculas: F1 con el primero
// pulsado es la ranura 13.

/** Los tres tipos. `quickslottype_e` (player.h:89-94). */
export const TIPO = Object.freeze({ objeto: 0, hechizo: 1, flecha: 2 });

/** `#define MAX_QUICKSLOTS 36` (player.h:102). */
export const MAX_RANURAS = 36;

/** Cuántas teclas hay de verdad: F1..F12. */
export const TECLAS_DE_RANURA = 12;

/**
 * `ms_quickslot_timeout "2.5"` (clientlibrary.cpp:145).
 *
 * Y lo que hace al cumplirse NO es elegir: es **cancelar**. En `Update()`
 * (vgui_quickslot.h:81-85) la llamada a `ConfirmItem()` está comentada y lo
 * que corre es `SelectItem(NULL)`. Quien cicla con el 1 y se queda mirando no
 * equipa nada; el arma sigue siendo la que tenía.
 */
export const ESPERA = 2.5;

/**
 * Los dos segundos que hay que aguantar una tecla de ranura para GRABAR en
 * ella lo que llevas puesto. Es un `2` a pelo, sin cvar (vgui_quickslot.h:72).
 */
export const AGUANTE_PARA_GRABAR = 2;

/**
 * El color de la etiqueta dice de qué tipo es lo que estás ciclando
 * (vgui_quickslot.h:10-12). El cuarto número es el alfa del motor, que en VGUI
 * es «cuánto se lava» y vale 0 en los tres.
 */
export const COLORES = Object.freeze({
  objeto: [255, 255, 255],
  hechizo: [120, 255, 255],
  flecha: [0, 255, 128],
});

/**
 * Los sonidos, y son un solo archivo de verdad.
 *
 * El motor tiene dos ganchos —`QuickSlot_Select` y `QuickSlot_Confirm`— pero
 * el de elegir está **forzado** a `ui/buttonclick.wav` con el original al lado
 * comentado, tres veces, cada una firmada «Thothie FEB2008a»
 * (vgui_quickslot.h:123, 161, 216). El de confirmar sí usa el gancho.
 */
export const SONIDOS = Object.freeze({
  elegir: "ui/buttonclick.wav",
  confirmar: "ui/buttonclickrelease.wav",
  encima: "ui/buttonrollover.wav",
});

/**
 * El siguiente objeto después de `desdeId`. `GetItemInInventory`
 * (msmonstershared.cpp:230-298), con tres cosas que no se adivinan:
 *
 *  1. **Da la vuelta por accidente.** No hay `% tamaño`: recorre buscando el
 *     de `desdeId`, y si llega al final sin encontrar el siguiente cae en
 *     `if (Items.size()) return Items[0];`, que es el comentario «Item with
 *     StartID wasn't found». Así que el último cicla al primero — y el primero
 *     es justo `m_FirstQuickItem`, con lo que la etiqueta se apaga. La vuelta
 *     entera termina donde empezó, no en bucle infinito.
 *  2. **Lo que llevas en la mano no está en la lista.** Se llama con
 *     `CheckHands = false` (vgui_quickslot.h:113) y el bucle salta los de
 *     `ITEMPOS_HANDS`. Ciclar armas nunca te ofrece la que ya tienes.
 *  3. **Arma es «algo que tiene ataques»**, no una categoría: `if (WeaponOnly)`
 *     borra los de `!pItem->m_Attacks.size()`.
 */
export function siguienteEnInventario(lista, desdeId, { soloArmas = false, empiezaPor = "" } = {}) {
  let items = lista.filter((o) => !o.enMano);
  if (empiezaPor) items = items.filter((o) => String(o.id ?? "").startsWith(empiezaPor));
  if (soloArmas) items = items.filter((o) => o.arma);
  if (!items.length) return null;
  const i = items.findIndex((o) => o.id === desdeId);
  if (i >= 0 && i + 1 < items.length) return items[i + 1];
  return items[0];
}

/** Qué proyectil pide el arma de la mano. `ProjType` (vgui_quickslot.h:41). */
export function tipoDeProyectil(arma) {
  const p = String(arma?.ataques?.[0]?.proyectil ?? "");
  if (!arma?.ataques?.length) return "cualquiera";
  if (p.includes("arrow")) return "flecha";
  if (p.includes("bolt")) return "virote";
  return "cualquiera";
}

/** Las dos municiones infinitas que el ciclo ofrece siempre. */
export const INFINITAS = Object.freeze({
  flecha: { id: "proj_arrow_generic", nombre: "Crude Wooden Arrow", infinita: true },
  virote: { id: "proj_bolt_generic", nombre: "Crude Wooden Bolt", infinita: true },
});

/**
 * EL CICLADOR. Una etiqueta abajo a la izquierda y nada más.
 *
 * No es un menú: no se dibuja una lista ni se puede mirar lo que hay. Cada
 * pulsación avanza uno y escribe su nombre; el botón de atacar lo acepta y la
 * espera lo tira. Ciclar hasta el final apaga la etiqueta, y ése es el único
 * aviso de que ya lo has visto todo.
 */
export class Ciclador {
  constructor({ espera = ESPERA } = {}) {
    this.espera = espera;
    this.apagar();
  }

  /** `SelectItem(NULL)` (vgui_quickslot.h:253-261). */
  apagar() {
    this.activo = false;
    this.tipo = TIPO.objeto;
    this.id = null;
    this.primerId = null;    // m_FirstQuickItem: al volver a él, a negro
    this.ciclo = 0;          // m_Cycle, sólo para la munición
    this.proyectil = "cualquiera";
    this.elegido = null;
    this.reloj = 0;
  }

  /** El color y el texto de la etiqueta, o null si no hay nada que enseñar. */
  get etiqueta() {
    if (!this.activo || !this.elegido) return null;
    const clave = this.tipo === TIPO.hechizo ? "hechizo" : this.tipo === TIPO.flecha ? "flecha" : "objeto";
    // «Cast » delante de un hechizo y « (Infinite)» detrás de la munición de
    // balde, los dos del motor (vgui_quickslot.h:236-241). Van en inglés
    // porque son el texto del juego, no nuestra prosa.
    let texto = this.elegido.nombre ?? String(this.elegido.id ?? "");
    if (this.tipo === TIPO.hechizo) texto = `Cast ${texto}`;
    if (this.tipo === TIPO.flecha && this.elegido.infinita) texto += " (Infinite)";
    return { texto, clave, rgb: COLORES[clave], id: this.elegido.id ?? null };
  }

  /**
   * Una pulsación del comando `quickslot <tipo>`. Devuelve el sonido a dar, o
   * null. `Select()` (vgui_quickslot.h:88-229).
   *
   * Cambiar de tipo con la etiqueta puesta la reinicia: `if (NewType !=
   * m_SelectedSlot.Type && m_Active) SelectItem(NULL);`. O sea que ciclar
   * armas, ver una y pulsar el de hechizos NO deja el arma a medias — la
   * suelta.
   */
  elegir(clave, mundo = {}) {
    const tipo = { weapon: TIPO.objeto, arma: TIPO.objeto, spell: TIPO.hechizo,
      hechizo: TIPO.hechizo, arrow: TIPO.flecha, flecha: TIPO.flecha }[clave];
    if (tipo === undefined) return null;

    if (tipo !== this.tipo && this.activo) this.apagar();
    this.tipo = tipo;
    this.reloj = 0;

    if (tipo === TIPO.objeto) return this._ciclarObjeto(mundo);
    if (tipo === TIPO.hechizo) return this._ciclarHechizo(mundo);
    return this._ciclarFlecha(mundo);
  }

  _ciclarObjeto(mundo) {
    const item = siguienteEnInventario(mundo.objetos ?? [], this.id, { soloArmas: true });
    // Sin nada que ofrecer, el motor NO apaga la etiqueta: el `if (pItem)` de
    // vgui_quickslot.h:114 no tiene `else`. La rama de la munición sí lo tiene
    // (226). Se queda como está, con su bug.
    if (!item) return null;
    if (item.id === this.primerId) { this.apagar(); return null; }
    this._encender(item);
    if (this.primerId === null) this.primerId = item.id;
    return SONIDOS.elegir;
  }

  /**
   * Los hechizos no son objetos: son una lista de nombres (`m_SpellList`) y se
   * recorren por índice. Y **no dan la vuelta**: al llegar al último,
   * `QuickSlot.Active = false` y la etiqueta se apaga (vgui_quickslot.h:146-147).
   * Distinto de las armas, que vuelven al primero. Nadie escribió las dos
   * ramas el mismo día.
   */
  _ciclarHechizo(mundo) {
    const lista = mundo.hechizos ?? [];
    if (!lista.length) { this.apagar(); return null; }
    let i = this.id;
    if (!Number.isInteger(i) || i < 0 || i >= lista.length) i = 0;
    else if (i < lista.length - 1) i += 1;
    else { this.apagar(); return null; }
    this.id = i;
    this._encender({ id: i, nombre: lista[i] }, false);
    return SONIDOS.elegir;
  }

  _ciclarFlecha(mundo) {
    let item = null;
    let generica = true;

    if (this.ciclo === 0) {
      // La primera pulsación mira el arma de la mano para saber si pedir
      // flechas o virotes.
      this.proyectil = tipoDeProyectil(mundo.armaEnMano ?? null);
      item = this.proyectil === "virote" ? INFINITAS.virote : INFINITAS.flecha;
    } else if (this.ciclo === 1 && this.proyectil === "cualquiera") {
      // Con un arma que no dice qué dispara, la segunda es el virote de balde.
      item = INFINITAS.virote;
    } else {
      generica = false;
      const prefijo = this.proyectil === "flecha" ? "proj_arrow_"
        : this.proyectil === "virote" ? "proj_bolt_" : "proj_";
      item = siguienteEnInventario(mundo.flechas ?? [], this.id, { empiezaPor: prefijo });
    }

    this.ciclo += 1;

    if (!item || item.id === this.primerId) { this.apagar(); return null; }
    this._encender(item);
    this.id = item.id;
    // Las dos infinitas NO se graban como «la primera»: sin ese `&& !GENERIC`
    // (vgui_quickslot.h:212) el ciclo se apagaría en la segunda pulsación.
    if (this.primerId === null && !generica) this.primerId = item.id;
    return SONIDOS.elegir;
  }

  _encender(item, ponId = true) {
    this.elegido = item;
    this.activo = true;
    if (ponId) this.id = item.id;
  }

  /** El reloj de la espera. Lo que se cumple CANCELA, no acepta. */
  paso(dt) {
    if (!this.activo) return;
    this.reloj += dt;
    if (this.reloj >= this.espera) this.apagar();
  }

  /**
   * El botón de atacar acepta lo que haya en la etiqueta, y **se lo come**:
   * `if (QuickSlotConfirm()) player.BlockButton(IN_ATTACK);`
   * (clplayer.cpp:558-562). O sea que el clic con el que equipas no da también
   * un espadazo, y hay que soltar y volver a pulsar.
   *
   * Devuelve la orden, que es literalmente el comando que el motor manda al
   * servidor, o null si no había nada puesto.
   */
  confirmar() {
    if (!this.activo || !this.elegido) return null;
    const e = this.elegido;
    let orden;
    if (this.tipo === TIPO.objeto) orden = { que: "empunar", id: e.id, comando: `inv transfer ${e.id} 0` };
    else if (this.tipo === TIPO.hechizo) orden = { que: "preparar", hechizo: e.nombre, comando: `prep ${e.nombre}` };
    else orden = {
      que: "elegirMunicion", id: e.id, infinita: Boolean(e.infinita),
      comando: e.infinita
        ? `selectarrow GENERIC_${this.proyectil === "virote" ? "BOLT" : "ARROW"}`
        : `selectarrow ${e.id}`,
    };
    orden.sonido = SONIDOS.confirmar;
    orden.nombre = e.nombre ?? String(e.id ?? "");
    this.apagar();
    return orden;
  }
}

/**
 * LAS DOCE TECLAS. Tres funciones en la misma: pulsar usa, aguantar graba y
 * dos modificadores corren la numeración.
 *
 * `SlotPressed` (vgui_quickslot.h:338-361) + `Update` (72-76). Y hay una grieta
 * transcrita: al soltar, `if (!m_StartedHolding || ahora - m_StartedHolding >=
 * 2) return;` — pero `Update()` ya puso `m_StartedHolding = 0` al grabar, así
 * que la primera condición es la que corta y la segunda no se alcanza nunca.
 * Está escrita dos veces la misma idea, por si el fotograma no llegó.
 */
export class Ranuras {
  constructor({ guardadas = null, aguante = AGUANTE_PARA_GRABAR } = {}) {
    this.aguante = aguante;
    this.ranuras = new Array(MAX_RANURAS).fill(null);
    if (Array.isArray(guardadas)) {
      for (let i = 0; i < Math.min(guardadas.length, MAX_RANURAS); i++) {
        this.ranuras[i] = guardadas[i] ?? null;
      }
    }
    this.desplazamiento = 0;   // 0, 12 o 24: los dos alias `+shift_slots`
    this._pulsada = null;      // m_HoldSlot
    this._desde = null;        // m_StartedHolding
    this.reloj = 0;
  }

  /** De la tecla (1..12) a la ranura de verdad (0..35), con el desplazamiento. */
  indiceDe(tecla) {
    const i = (tecla - 1) + this.desplazamiento;
    return i >= 0 && i < MAX_RANURAS ? i : null;
  }

  /** `+shift_slots1` / `+shift_slots2`, mantenidos. */
  desplazar(cuanto) {
    this.desplazamiento = cuanto === 24 ? 24 : cuanto === 12 ? 12 : 0;
  }

  /** Tecla abajo. Sólo arranca el cronómetro; no hace nada más. */
  pulsar(tecla) {
    const i = this.indiceDe(tecla);
    if (i === null) return;
    this._pulsada = i;
    this._desde = this.reloj;
  }

  /**
   * Tecla arriba antes de los dos segundos: usa lo que haya. Devuelve la orden
   * (el mismo objeto que `Ciclador.confirmar`) o null.
   *
   * `if (!QuickSlot.Active) return;` — una ranura vacía no dice nada. Ni un
   * pitido ni un aviso: el juego se queda callado, y es lo que hay que portar.
   */
  soltar(tecla) {
    const i = this.indiceDe(tecla);
    if (this._desde === null || i === null) { this._desde = null; return null; }
    this._desde = null;
    const guardada = this.ranuras[i];
    if (!guardada) return null;
    return { ...guardada, ranura: i };
  }

  /**
   * El paso del tiempo, que es donde se graba: a los dos segundos aguantando,
   * `AssignSlot(m_HoldSlot)` manda `quickslot create N current` y suena.
   * Devuelve `{ ranura }` si acaba de grabar.
   */
  paso(dt, actual = null) {
    this.reloj += dt;
    if (this._desde === null) return null;
    if (this.reloj - this._desde <= this.aguante) return null;
    const i = this._pulsada;
    this._desde = null;
    if (i === null) return null;
    // `current` lo resuelve el SERVIDOR, no el cliente: el comando dice
    // «lo que llevo puesto» y el servidor mira la mano (client.cpp:906).
    this.ranuras[i] = actual ? { ...actual } : null;
    return { ranura: i, grabado: this.ranuras[i], sonido: SONIDOS.elegir };
  }

  /** Para guardar y para la sonda. */
  aTexto() { return this.ranuras.map((r) => (r ? r.nombre ?? r.id : null)); }

  /** Lo que va al documento del personaje. Ver `guardarRanuras`. */
  aGuardar() { return guardarRanuras(this.ranuras); }
}

/**
 * LAS RANURAS AL DISCO, que es un trozo de fichero de personaje.
 *
 * `sv_character.cpp:696-708`, y el formato importa porque explica las dos
 * cosas raras del recobro:
 *
 *     WriteByte(CHARDATA_QUICKSLOTS1);   // la etiqueta del trozo
 *     WriteByte(MAX_QUICKSLOTS);         // 36, SIEMPRE las 36
 *     for (q = 0..35)
 *       if (Active) { WriteByte(Type + 1); WriteInt(ID); }
 *       else          WriteByte(0);
 *
 * Dos detalles:
 *
 * **El tipo va desplazado en uno** porque el cero es «vacío» y `QS_ITEM` vale
 * cero. El que lee lo deshace: `Type - 1`, con el comentario «Slot type is
 * offset by 1» (`sv_character.cpp:377`). Nosotros no escribimos bytes, así que
 * aquí el desplazamiento no hace falta —guardamos `null` o el tipo— y queda
 * escrito para quien compare los dos ficheros.
 *
 * **Se guardan las 36 aunque estén vacías.** Un fichero de personaje lleva 36
 * bytes de ranura como mínimo, y por eso el que lee no necesita saber cuántas
 * hay: se lo dice el byte anterior. Esto es lo que permite que `MAX_QUICKSLOTS`
 * suba de 12 a 36 sin romper los personajes viejos, que traen 12 y se leen
 * enteros.
 */
export function guardarRanuras(ranuras) {
  const fuera = new Array(MAX_RANURAS).fill(null);
  for (let i = 0; i < MAX_RANURAS; i++) {
    const r = ranuras?.[i];
    if (!r) continue;
    // El tipo sale del `que` de la orden, que es la forma en que esto viaja por
    // el juego. Es la misma correspondencia de `Ciclador.confirmar`.
    const tipo = r.que === "preparar" ? TIPO.hechizo
      : r.que === "elegirMunicion" ? TIPO.flecha : TIPO.objeto;
    fuera[i] = { tipo, id: r.id ?? null, infinita: r.infinita ? true : undefined };
    if (fuera[i].infinita === undefined) delete fuera[i].infinita;
  }
  return fuera;
}

/**
 * Y AL VOLVER, que es donde está la regla de verdad: **sólo se comprueban las
 * ranuras de OBJETO** (`player.cpp:6514-6531`):
 *
 *     if (QuickSlot.Active && (QuickSlot.Type == QS_ITEM)) {
 *       bool bFound = false;
 *       for (i...) if (Items[i]->m_OldID == QuickSlot.ID) {
 *         QuickSlot.ID = Items[i]->m_iId; bFound = true; break; }
 *       QuickSlot.Active = bFound;      // <- y si no está, se apaga y calla
 *     }
 *
 * Tres cosas que salen de ahí y que hay que portar tal cual:
 *
 * 1. **Una ranura con un objeto que ya no llevas se apaga sin avisar.** Vendes
 *    la espada y la F3 deja de existir. No hay mensaje: `Active = bFound`.
 * 2. **El identificador del objeto CAMBIA entre sesiones.** El motor guarda el
 *    ID de instancia de la partida anterior y lo vuelve a atar buscando
 *    `m_OldID`. Aquí los identificadores son nombres de script —`swords_rsword`
 *    es el mismo mañana— así que la re-atadura es una comprobación de que lo
 *    sigues llevando, que es lo único que ese bucle consigue de verdad.
 * 3. **Los hechizos y la munición NO se comprueban.** Y en el caso del hechizo
 *    eso es un fallo con consecuencia: `AssignQuickSlot` guarda como ID **el
 *    índice dentro de `m_SpellList`** (`player.cpp:6748`, `QuickSlot.ID = i`),
 *    no el nombre. Si entre dos sesiones aprendes un hechizo que se cuela antes
 *    en la lista, **la ranura apunta a otro hechizo** y el juego lo lanza sin
 *    inmutarse. Lo reproducimos guardando el nombre —no tenemos lista con
 *    orden— y dejando la ranura sin comprobar, que es la mitad portable del
 *    fallo; la otra mitad queda escrita aquí y en su prueba.
 *
 * `nombres` es id → nombre visible, para devolver la etiqueta: el motor no la
 * guarda porque la saca del objeto, y nosotros tampoco.
 */
export function cargarRanuras(guardadas, { objetos = [], nombres = {} } = {}) {
  const tengo = new Set((objetos ?? []).map((o) => (typeof o === "string" ? o : o?.id)));
  const ranuras = new Array(MAX_RANURAS).fill(null);
  const perdidas = [];
  for (let i = 0; i < MAX_RANURAS; i++) {
    const g = guardadas?.[i];
    if (!g || g.tipo === undefined || g.tipo === null) continue;
    if (g.tipo === TIPO.objeto) {
      if (!tengo.has(g.id)) { perdidas.push({ ranura: i, id: g.id }); continue; }
      ranuras[i] = { que: "empunar", id: g.id, nombre: nombres[g.id] ?? g.id };
    } else if (g.tipo === TIPO.hechizo) {
      ranuras[i] = { que: "preparar", hechizo: g.id, nombre: g.id };
    } else {
      // La munición infinita no es un objeto del inventario: es un `GENERIC_`
      // que el cliente fabrica al vuelo, así que tampoco hay nada que buscar.
      ranuras[i] = {
        que: "elegirMunicion", id: g.id, nombre: nombres[g.id] ?? g.id,
        ...(g.infinita ? { infinita: true } : {}),
      };
    }
  }
  return { ranuras, perdidas };
}
