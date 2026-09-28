// EL ALMACÉN DEL SERVIDOR: los personajes en el disco de la partida.
//
// Las mismas cuatro operaciones de `src/juego/almacen.js` —`listar`, `leer`,
// `escribir`, `borrar`— contra un directorio. Es `LOC_SERVER` de Master Sword:
//
//     enum charloc_e { LOC_CLIENT, LOC_SERVER, LOC_CENTRAL };
//
// Va en un archivo aparte y no dentro de `almacen.js` por una razón de peso:
// **`almacen.js` lo importa el navegador**, y un `import "node:fs"` ahí rompe
// la página entera. La interfaz es la misma; el sitio, no.
//
// ── Lo que MSR hace con el fichero, y se copia ────────────────────────────
//
//     remove(pszCharFileName);              //Delete savefile
//     remove(BACKUP_NAME(pszCharFileName)); //Delete backup
//                                          sv_character.cpp:126-127
//
// Hay un respaldo al lado de cada personaje, y se borra con él. El respaldo no
// es por si el jugador se arrepiente: es por si el servidor se cae **mientras
// escribe**, que es el único momento en el que un personaje se pierde de
// verdad. Aquí eso se resuelve además escribiendo a un temporal y renombrando,
// que en el mismo sistema de ficheros es atómico: o está el viejo entero o
// está el nuevo entero, nunca medio.

import { mkdir, readdir, readFile, writeFile, rename, unlink, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { abrirPersonaje, sellar } from "../juego/personaje.js";

export class AlmacenArchivos {
  constructor({ carpeta }) {
    if (!carpeta) throw new Error("un almacén de archivos necesita una carpeta");
    this.carpeta = carpeta;
    this._lista = null;
  }

  async _preparar() {
    if (!this._lista) this._lista = mkdir(this.carpeta, { recursive: true });
    await this._lista;
  }

  _ruta(id) {
    // El id llega del cliente, así que **no puede tocar el disco**: sin esto,
    // un id como `../../.ssh/id_rsa` es una lectura arbitraria con dos barras.
    const limpio = String(id).replace(/[^A-Za-z0-9_-]/g, "");
    if (!limpio) throw new Error("identificador de personaje vacío");
    return join(this.carpeta, `${limpio}.json`);
  }

  async listar() {
    await this._preparar();
    const nombres = (await readdir(this.carpeta)).filter((n) => n.endsWith(".json") && !n.endsWith(".bak.json"));
    const fuera = [];
    for (const n of nombres) {
      try {
        const doc = JSON.parse(await readFile(join(this.carpeta, n), "utf8"));
        fuera.push({ id: doc.id, nombre: doc.nombre, actualizado: doc.actualizado, version: doc.version, mapa: doc.mapa ?? null });
      } catch {
        // Un personaje ilegible no puede tumbar la lista de los demás: se
        // salta y se queda en el disco para poder mirarlo.
      }
    }
    return fuera.sort((a, b) => String(b.actualizado).localeCompare(String(a.actualizado)));
  }

  async leer(id) {
    await this._preparar();
    let texto;
    try { texto = await readFile(this._ruta(id), "utf8"); } catch { return null; }
    return abrirPersonaje(JSON.parse(texto));
  }

  async escribir(p) {
    await this._preparar();
    const doc = sellar(p);
    const ruta = this._ruta(doc.id);
    // El respaldo es la copia ANTERIOR, no la nueva: un respaldo hecho después
    // de escribir respalda exactamente lo que se acaba de poder perder.
    try { await copyFile(ruta, ruta.replace(/\.json$/, ".bak.json")); } catch { /* la primera vez no hay */ }
    const temporal = `${ruta}.tmp`;
    await writeFile(temporal, JSON.stringify(doc, null, 1), "utf8");
    await rename(temporal, ruta);
    return doc;
  }

  async borrar(id) {
    await this._preparar();
    const ruta = this._ruta(id);
    await unlink(ruta).catch(() => {});
    await unlink(ruta.replace(/\.json$/, ".bak.json")).catch(() => {});
  }

  async pedirPermanencia() { return { soportado: true, concedido: true, disco: true }; }
}
