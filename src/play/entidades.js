// BUSCAR UNA ENTIDAD POR SU NOMBRE, Y QUITARLA.
//
// El trozo de `CBaseEntity` que hace falta para que `$get_by_name` y
// `deleteent` tengan a quién señalar. Es pequeño a propósito: no es una lista
// de entidades del juego, es **la traducción nombre <-> asa** que los guiones
// usan para pasarse una entidad de una variable a otra.
//
// ── EL ASA, QUE NO ES UN NOMBRE NI UN ÍNDICE ──────────────────────────────
//
// `$get_by_name` no devuelve «spawners6» ni un número: devuelve
//
//     #define ENT_FORMAT ENT_PREFIX "(%i,%u)"        // "PentP"
//     _snprintf(RetString, ..., ENT_FORMAT, pEntity->entindex(), (int)pEntity);
//                                          sharedutil.cpp:80-90
//
// o sea **«PentP(índice,dirección)»**, con el puntero metido dentro. Y quien la
// recibe la deshace con `StringToEnt`, que comprueba LAS DOS cosas:
//
//     CBaseEntity *pEntity = MSInstance(INDEXENT(Idx));
//     if (!pEntity || (uint)pEntity != Addr) return NULL;
//                                          sharedutil.cpp:91-104
//
// Eso no es ceremonia: es lo que hace que un asa **caduque**. Si la entidad del
// índice 42 se borra y el motor reutiliza ese hueco para otra, el asa vieja
// tiene la dirección vieja, no coincide, y devuelve `NULL` en vez de la
// entidad equivocada. Un asa guardada en una variable de guion es por tanto
// segura de leer más tarde, que es justo lo que hace el alcalde: la mete en
// `L_KILL_SPAWN` y la usa en la línea siguiente.
//
// Aquí la «dirección» es un contador que no se reutiliza jamás, que consigue lo
// mismo con la ventaja de que tampoco se reutiliza por accidente.
//
// ── CÓMO SE BUSCA, Y EL ORDEN ─────────────────────────────────────────────
//
//     CBaseEntity *pEntity = UTIL_FindEntityByString(NULL, "netname", msstring("¯") + Params[0]);
//     if (pEntity) return EntToString(pEntity);
//     else {
//       //Thothie DEC2014_11 check map ents too
//       CBaseEntity *pEntity = UTIL_FindEntityByString(NULL, "targetname", Params[0].c_str());
//       if (pEntity) return EntToString(pEntity);
//     }
//     return "0";                          script.cpp:1441-1456
//
// Primero los nombres puestos por un guion con `name_unique`, que se guardan en
// `netname` **con un macrón delante** (`m_NetName = msstring("¯") + Params[0]`,
// scriptcmds.cpp:4456) para que no choquen con nada del mapa; y sólo si eso
// falla, el `targetname` de las entidades del `.bsp`.
//
// Esa segunda mitad es de 2014 y es la que importa aquí: sin ella el
// `remove_spawns` del alcalde no encuentra un solo generador, porque
// «spawners6» es un `targetname` del mapa y no lo puso ningún `name_unique`.

/** `#define ENT_PREFIX "PentP"` — sharedutil.h:66. */
export const PREFIJO = "PentP";

/** `EntToString` — sharedutil.cpp:81. */
export function aTexto(indice, direccion) { return `${PREFIJO}(${indice},${direccion})`; }

/**
 * `StringToEnt` — sharedutil.cpp:91. Sólo parte el texto; comprobar que la
 * dirección sigue siendo la de esa entidad es de `Entidades.recuperar`.
 */
export function deTexto(texto) {
  const m = new RegExp(`^${PREFIJO}\\((-?\\d+),(\\d+)\\)$`).exec(String(texto ?? ""));
  return m ? { indice: Number(m[1]), direccion: Number(m[2]) } : null;
}

/**
 * Las entidades con nombre de un mapa.
 *
 * `que` es lo que quiera quien registre —un área del `Aparecedor`, un NPC—; esto
 * sólo guarda el nombre, le da un índice y sabe borrarlo.
 */
export class Entidades {
  constructor() {
    /** Por índice. Un hueco borrado queda a `null` y **se reutiliza**, como el motor. */
    this.slots = [];
    /** El contador que hace de «dirección». No se reutiliza nunca. */
    this.siguienteDireccion = 1;
  }

  /**
   * Mete una entidad. `unico` es `name_unique` —va al `netname`— y sin él es
   * un `targetname` del mapa.
   */
  registrar(nombre, que = null, { unico = false } = {}) {
    let i = this.slots.indexOf(null);
    if (i < 0) { i = this.slots.length; this.slots.push(null); }
    const ent = { indice: i, direccion: this.siguienteDireccion++, nombre: String(nombre), unico, que, viva: true };
    this.slots[i] = ent;
    return ent;
  }

  /** `UTIL_FindEntityByString`: el PRIMERO que casa, no todos. */
  _buscar(nombre, unico) {
    return this.slots.find((s) => s && s.unico === unico && s.nombre === nombre) ?? null;
  }

  /** `$get_by_name`: el asa, o `null`. `netname` primero, `targetname` después. */
  porNombre(nombre) {
    const n = String(nombre ?? "");
    const ent = this._buscar(n, true) ?? this._buscar(n, false);
    return ent ? aTexto(ent.indice, ent.direccion) : null;
  }

  /**
   * `RetrieveEntity(asa)` — global.cpp:382 -> `StringToEnt`. Devuelve `null`
   * si el asa caducó, que es todo el sentido de llevar la dirección dentro.
   */
  recuperar(asa) {
    const p = deTexto(asa);
    if (!p) return null;
    const s = this.slots[p.indice];
    return s && s.direccion === p.direccion ? s : null;
  }

  /** `UTIL_Remove`. Deja el hueco libre; el asa vieja ya no vale. */
  borrar(asa) {
    const s = this.recuperar(asa);
    if (!s) return null;
    s.viva = false;
    this.slots[s.indice] = null;
    return s;
  }

  /** Para las pruebas y la sonda: cuántas quedan en pie. */
  get n() { return this.slots.filter(Boolean).length; }
  get nombres() { return this.slots.filter(Boolean).map((s) => s.nombre); }
}
