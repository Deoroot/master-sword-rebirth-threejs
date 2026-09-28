// Dónde viven los personajes.
//
// ── Por qué esto es una INTERFAZ y no «guardar en IndexedDB» ───────────────
//
// Master Sword ya tenía tres sitios y el juego no sabía en cuál estaba:
//
//     enum charloc_e { LOC_CLIENT, LOC_SERVER, LOC_CENTRAL };
//
// disco del jugador, disco del servidor, o una cuenta remota con JSON sobre
// HTTP. El resto del código habla con `charinfo_t`, no con un fichero. Eso es
// lo único de su almacenamiento que copiaría sin pensarlo, porque es lo que
// convierte «pasar a cuentas en la nube» en escribir una clase.
//
// Cuatro operaciones: `listar`, `leer`, `escribir`, `borrar`.
//
// ── Y lo que hay que temer, dicho en voz alta ──────────────────────────────
//
// **El almacén de un navegador se puede borrar.** No es una posibilidad
// remota:
//
//   - el navegador puede DESALOJAR los datos si le falta espacio, salvo que se
//     conceda `navigator.storage.persist()` — y aun concedido no es absoluto;
//   - «borrar datos de navegación» se lo lleva todo, y el jugador lo hace por
//     otros motivos;
//   - es por ORIGEN y por NAVEGADOR: el personaje no existe en otro equipo, ni
//     en el mismo equipo con otro navegador, ni en una ventana privada.
//
// Por eso `exportar`/`importar` no son un extra: **son la copia de
// seguridad**, y están desde el primer día.

import { abrirPersonaje, sellar } from "./personaje.js";

const BASE = "mydra-personajes";
const TIENDA = "personajes";

/**
 * El almacén de IndexedDB.
 *
 * IndexedDB y no `localStorage`, y las tres razones son de peso:
 * `localStorage` es SÍNCRONO —bloquea el bucle de dibujo—, son 5–10 MB y sólo
 * guarda texto. `localStorage` se queda para las preferencias del visor.
 */
export class AlmacenLocal {
  constructor({ nombreBase = BASE } = {}) {
    this.nombreBase = nombreBase;
    this._db = null;
  }

  async _abrir() {
    if (this._db) return this._db;
    if (!globalThis.indexedDB) throw new Error("este navegador no trae IndexedDB");
    this._db = await new Promise((ok, mal) => {
      const req = indexedDB.open(this.nombreBase, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(TIENDA)) db.createObjectStore(TIENDA, { keyPath: "id" });
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => mal(req.error);
    });
    return this._db;
  }

  async _tx(modo, fn) {
    const db = await this._abrir();
    return new Promise((ok, mal) => {
      const tx = db.transaction(TIENDA, modo);
      const req = fn(tx.objectStore(TIENDA));
      tx.onerror = () => mal(tx.error);
      tx.oncomplete = () => ok(req?.result);
    });
  }

  /**
   * Pide al navegador que NO desaloje estos datos.
   *
   * Devuelve si lo ha concedido. No lanza: que lo deniegue es un resultado,
   * no un fallo — y es justo el caso en el que hay que insistirle al jugador
   * con la exportación.
   */
  async pedirPermanencia() {
    try {
      if (!navigator.storage?.persist) return { soportado: false, concedido: false };
      const ya = (await navigator.storage.persisted?.()) ?? false;
      const concedido = ya || (await navigator.storage.persist());
      let cuota = null;
      try { cuota = await navigator.storage.estimate(); } catch { /* da igual */ }
      return { soportado: true, concedido, cuota };
    } catch {
      return { soportado: false, concedido: false };
    }
  }

  async listar() {
    const todos = await this._tx("readonly", (t) => t.getAll());
    return (todos ?? [])
      .map((d) => ({ id: d.id, nombre: d.nombre, actualizado: d.actualizado, version: d.version, mapa: d.mapa ?? null }))
      .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
  }

  async leer(id) {
    const doc = await this._tx("readonly", (t) => t.get(id));
    return doc ? abrirPersonaje(doc) : null;
  }

  async escribir(p) {
    const doc = sellar(p);
    await this._tx("readwrite", (t) => t.put(doc));
    return doc;
  }

  async borrar(id) {
    await this._tx("readwrite", (t) => t.delete(id));
  }
}

/**
 * Un almacén en memoria, para las pruebas y para cuando IndexedDB no está.
 *
 * Existe por una razón concreta: **las pruebas del registro no deberían
 * necesitar un navegador.** Y porque una ventana privada puede no dar
 * IndexedDB, y ahí vale más un personaje que se pierde al cerrar que una
 * pantalla de error.
 */
export class AlmacenMemoria {
  constructor(inicial = []) {
    this.mapa = new Map(inicial.map((d) => [d.id, d]));
  }
  async listar() {
    return [...this.mapa.values()]
      .map((d) => ({ id: d.id, nombre: d.nombre, actualizado: d.actualizado, version: d.version, mapa: d.mapa ?? null }))
      .sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
  }
  async leer(id) { const d = this.mapa.get(id); return d ? abrirPersonaje(structuredClone(d)) : null; }
  async escribir(p) { const doc = sellar(p); this.mapa.set(doc.id, structuredClone(doc)); return doc; }
  async borrar(id) { this.mapa.delete(id); }
  async pedirPermanencia() { return { soportado: false, concedido: false }; }
}

/**
 * Un personaje como texto, para que el jugador se lo lleve.
 *
 * Con envoltorio y no el documento a pelo: así un fichero importado se puede
 * reconocer antes de abrirlo, y un `.json` de otra cosa da un error claro en
 * vez de un personaje raro.
 */
export const MARCA = "mydra/personaje";

export function exportar(p) {
  return JSON.stringify({ marca: MARCA, version: 1, exportado: new Date().toISOString(), personaje: p }, null, 1);
}

/**
 * Lee un fichero exportado. Acepta también un personaje a pelo, porque alguien
 * va a editar un JSON a mano y es mejor que funcione.
 */
export function importar(texto) {
  let doc;
  try { doc = JSON.parse(texto); } catch { throw new Error("that is not JSON"); }
  const crudo = doc?.marca === MARCA ? doc.personaje : doc;
  // Un array es un objeto, y `[1,2,3]` colaba hasta aquí para morir tres
  // líneas más abajo con «sin nombre» — un mensaje que manda a mirar el sitio
  // equivocado.
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) {
    throw new Error("the file has no character in it");
  }
  const { personaje, avisos } = abrirPersonaje(crudo);
  // Un personaje importado es OTRO personaje, aunque venga del mismo: si se
  // conserva el id, importar la copia de seguridad encima pisa el que hay, y
  // eso es exactamente lo que alguien intenta evitar al importar.
  return { personaje, avisos };
}
