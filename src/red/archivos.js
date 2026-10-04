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
import { abrirPersonaje, sellar, aLaVistaDe } from "../juego/personaje.js";

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
        fuera.push({ id: doc.id, nombre: doc.nombre, actualizado: doc.actualizado, version: doc.version, mapa: doc.mapa ?? null, vista: aLaVistaDe(doc) });
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

  /**
   * EL 100: LOS GUARDADOS DE UN MISMO PERSONAJE, EN FILA.
   *
   * Dos `escribir` del mismo id a la vez comparten `<id>.json.tmp`: los dos lo
   * escriben, el primero lo renombra y **el segundo encuentra el temporal ya
   * movido** y revienta con `ENOENT`. Lo enseñó la sonda reaparecer99 —«no se
   * ha podido guardar el personaje: ENOENT, rename …reaparecer99a.json.tmp»,
   * con A muriendo y volviendo— y en una prueba aparte son 12 fallos de 40
   * guardados lanzados de dos en dos (doc/SERVIDOR_100.md §4). Los reintentos
   * de abajo no lo arreglan: un temporal que ya no existe no aparece esperando.
   * Así que cada guardado espera al anterior del mismo personaje; el último
   * que se pide es el que queda en el disco, que es lo que se quería.
   */
  escribir(p) {
    this._filas ??= new Map();
    const id = p?.id;
    const antes = this._filas.get(id) ?? Promise.resolve();
    const este = antes.catch(() => {}).then(() => this._escribirYa(p));
    this._filas.set(id, este);
    const limpiar = () => { if (this._filas.get(id) === este) this._filas.delete(id); };
    este.then(limpiar, limpiar);
    return este;
  }

  async _escribirYa(p) {
    await this._preparar();
    const doc = sellar(p);
    const ruta = this._ruta(doc.id);
    // El respaldo es la copia ANTERIOR, no la nueva: un respaldo hecho después
    // de escribir respalda exactamente lo que se acaba de poder perder.
    try { await copyFile(ruta, ruta.replace(/\.json$/, ".bak.json")); } catch { /* la primera vez no hay */ }
    const temporal = `${ruta}.tmp`;
    await writeFile(temporal, JSON.stringify(doc, null, 1), "utf8");
    // EN WINDOWS EL RENOMBRADO PUEDE FALLAR, y no por nada que haga este código.
    //
    // `rename` sobre un archivo que existe es atómico y es lo que hace que un
    // corte de luz a mitad de guardar no deje un personaje a medias. Pero en
    // Windows el sistema de archivos no permite renombrar encima de un archivo
    // que alguien tiene abierto, aunque sea sólo para leerlo: el antivirus, el
    // indizador o la copia de seguridad valen. Da `EPERM` y se pierde el
    // guardado — que es la única cosa de este servidor que no se puede perder.
    //
    // Apareció así, y merece quedar escrito porque es exactamente la clase de
    // fallo que no da la cara cuando se busca: **una de cada ocho vueltas de
    // `sonda:red`**, y no la del control del guardado, sino la del control que
    // dice «el servidor no ha escupido ningún error». Sin ese control esto
    // habría llegado al alfa sin que nadie lo supiera.
    //
    // Tres intentos con espera creciente, porque quien tenga el archivo abierto
    // lo suelta en milisegundos. Si a la tercera sigue sin poder, el error sube:
    // un guardado que no se puede hacer tiene que decirse, no taparse.
    //
    // EL 100: y dos intentos más, a medio segundo y a segundo y medio. Con la
    // máquina al 100 % (cuatro sesiones y sus sondas) la sonda reaparecer99
    // vio un `EPERM` que sobrevivió a los tres: quien tiene el archivo abierto
    // puede ser este mismo servidor LEYÉNDOLO —`listar` abre todos los
    // personajes para contestar a «lista», y lo pidió B a la vez que A
    // guardaba— y con la máquina cargada esa lectura tarda más de 150 ms.
    let ultimo = null;
    for (const espera of [0, 30, 120, 500, 1500]) {
      if (espera) await new Promise((r) => setTimeout(r, espera));
      try { await rename(temporal, ruta); ultimo = null; break; }
      catch (e) { ultimo = e; }
    }
    if (ultimo) throw ultimo;
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
