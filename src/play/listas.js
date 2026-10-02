// LAS LISTAS DE LOS GUIONES — `array.*` y `$get_array*`.
//
// MiB las añadió en JAN2010_26 y son la estructura de datos que falta en el
// lenguaje: hasta entonces una lista era una cadena con puntos y comas y
// `$get_token`. Veintinueve scripts las usan, y son la mitad de lo que le falta
// al vendedor y al armero de Gate City.
//
// ── DE QUIÉN SON ─────────────────────────────────────────────────────────
//
//     msscriptarrayhash &vArrayHashMap = GLOBAL ? GlobalScriptArrays
//                                              : pEnt->scriptedArrays;
//                                          scriptcmds.cpp:1981
//
// Una lista **cuelga de una entidad**, no del guion: dos guiones del mismo NPC
// ven la misma. Las `g_array.*` cuelgan de un mapa estático y las ve todo el
// mundo, igual que las variables de `setvarg`.
//
// Y el primer parámetro puede ser **una entidad**, opcional y sin marcar:
//
//     if (!GLOBAL && Params.size() > vParam) {
//         pEnt = RetrieveEntity(ArrName);
//         if (pEnt) ArrName = Params[vParam++];
//     }                                    scriptcmds.cpp:1966-1972
//
// O sea que `array.add X Y` es «añade Y a la lista X **de este NPC**» salvo que
// X resulte ser un asa de entidad, en cuyo caso es «añade a la lista Y de X».
// Se decide en tiempo de ejecución mirando si `RetrieveEntity` contesta.
//
// ── LOS VALORES DE VUELTA, QUE SON CADENAS RARAS A PROPÓSITO ─────────────
//
// Los getters no devuelven vacío ni lanzan: devuelven **texto que los guiones
// comparan**. Y no todos el mismo, que es lo que hay que leer con cuidado
// (script.cpp:1248-1268):
//
//   | pregunta                     | la lista no existe | no encuentra   |
//   | ---------------------------- | ------------------ | -------------- |
//   | `$get_array_amt(L)`          | **"-1"**           | —              |
//   | `$get_array_exists(L)`       | "0"                | —              |
//   | `$get_arrayfind(L,x)`        | **"[ERROR_NO_ARRAY]"** | "-1"       |
//   | `$get_array(L,i)`            | "[ERROR_NO_ARRAY]" | ver abajo      |
//
// Y el que de verdad sorprende: **`$get_array(L,i)` fuera de rango devuelve su
// propio texto**, o sea la cadena «$get_array(L,9)». El motor cae hasta
// `return FullName` y Thothie lo documentó en vez de arreglarlo:
//
//     //Thothie DEC2017_19 NOTE: if the script requests an index out of range,
//     //this will cause the function to return its literal - screwy, but
//     //servicable (just check that pull request does not start with
//     //'$get_array').
//                                          script.cpp:1276
//
// Eso hace que `if ( $get_array(L,9) equals foo )` dé falso —bien— pero que
// `if $get_array(L,9)` dé **cierto** si el texto empieza por algo que `atoi` no
// lee como cero... que no es el caso, «$» da 0. Se porta tal cual.

/** `GlobalScriptArrays` — el mapa estático que comparten todos los guiones. */
export const LISTAS_GLOBALES = new Map();

/** Vacía las globales. Sólo para las pruebas y para empezar partida. */
export function olvidarListasGlobales() { LISTAS_GLOBALES.clear(); }

/** Lo que devuelve un getter cuando la lista no está. script.cpp:1264. */
export const SIN_LISTA = "[ERROR_NO_ARRAY]";
/** Y cuando faltan parámetros. script.cpp:1344. */
export const FALTAN_PARAMS = "[ERROR_MISSING_PARAMS]";

/**
 * Las listas de UNA entidad, o las globales.
 *
 * `Map<nombre, string[]>` y poco más; lo que tiene de interesante son los
 * bordes, que están todos citados arriba.
 */
export class Listas {
  constructor(mapa = null) { this.mapa = mapa ?? new Map(); }

  /** `GetScriptedArrayFromHashMap(..., bCreate)`. */
  buscar(nombre) { return this.mapa.get(String(nombre)) ?? null; }
  existe(nombre) { return this.mapa.has(String(nombre)); }

  /**
   * `array.create`. **Sobre una que ya existe NO hace nada**: no la vacía.
   * Lo dice la cabecera del motor —«does nothing if a same-name array already
   * exists», scriptcmds.cpp:1953— y es lo contrario de lo que hace
   * `npcstore.create`, que tampoco la vacía pero sí la reutiliza en silencio.
   */
  crear(nombre) {
    const n = String(nombre);
    if (!this.mapa.has(n)) this.mapa.set(n, []);
    return this.mapa.get(n);
  }

  anadir(nombre, valor) { const a = this.buscar(nombre); if (a) a.push(String(valor)); return a; }

  /** `array.add_unique` — Thothie SEP2019_29. Compara por igualdad exacta. */
  anadirUnico(nombre, valor) {
    const a = this.buscar(nombre);
    if (a && !a.includes(String(valor))) a.push(String(valor));
    return a;
  }

  /** `array.set`. Fuera de rango **no escribe**: el motor sólo se queja. :2040. */
  poner(nombre, i, valor) {
    const a = this.buscar(nombre);
    if (!a || i < 0 || i >= a.length) return false;
    a[i] = String(valor);
    return true;
  }

  /** `array.del`. Fuera de rango tampoco hace nada. :2055. */
  quitar(nombre, i) {
    const a = this.buscar(nombre);
    if (!a || i < 0 || i >= a.length) return false;
    a.splice(i, 1);
    return true;
  }

  /** `array.erase`: se lleva la lista entera. `array.clear`: la deja vacía. */
  borrar(nombre) { return this.mapa.delete(String(nombre)); }
  vaciar(nombre) { const a = this.buscar(nombre); if (a) a.length = 0; return Boolean(a); }

  /** `array.copy <origen> <destino>`. **Añade al destino, no lo reemplaza** (:2001). */
  copiar(origen, destino) {
    const a = this.buscar(origen);
    if (!a) return false;
    const b = this.crear(destino);
    for (const v of a) b.push(v);
    return true;
  }

  get n() { return this.mapa.size; }
}

/**
 * `$get_arrayfind(<lista>,<qué>,[tipo],[desde],[sin mayúsculas])`.
 * script.cpp:1286-1335.
 *
 * Devuelve el índice, o **-1**. Y el tipo de búsqueda tiene una rareza que hay
 * que portar: si no es ninguno de los cuatro conocidos, el motor **retrocede el
 * cursor de parámetros** y lo vuelve a leer como «desde»:
 *
 *     else { vSrchType = 3; --vParam; }    // Reset to get start index
 *                                          script.cpp:1303
 *
 * O sea que `$get_arrayfind(L,x,3)` no busca «de tipo 3»: busca por igualdad
 * **desde el índice 3**. Es lo que permite que el tercer parámetro sea el tipo
 * o el índice sin marcarlo.
 */
export function buscarEnLista(lista, { que, tipo = "equals", desde = 0, sinMayusculas = false } = {}) {
  if (!lista) return -1;
  const cmp = (v) => (sinMayusculas ? String(v).toLowerCase() : String(v));
  const buscado = cmp(que);
  const i0 = Math.max(0, Number(desde) || 0);
  for (let i = i0; i < lista.length; i++) {
    const v = cmp(lista[i]);
    const hay = tipo === "startswith" ? v.startsWith(buscado)
      : tipo === "endswith" ? v.endsWith(buscado)
        : tipo === "contains" ? v.includes(buscado)
          : v === buscado;                  // «equals», y el por defecto
    if (hay) return i;
  }
  return -1;
}

/** Los cuatro tipos que el motor reconoce. Cualquier otro es «equals». :1298-1305. */
export const TIPOS_DE_BUSQUEDA = new Set(["startswith", "endswith", "contains", "equals"]);
