// EL PERSONAJE DE PRUEBAS EN SOLITARIO — experimento 96. SÓLO EN DESARROLLO.
//
// En solitario el personaje vive en el IndexedDB del navegador
// («mydra-personajes», src/juego/almacen.js) y `tools/personaje.mjs` corre en
// Node, que no puede escribir ahí. Lo que sí puede es dejar un fichero en
// `build/personajes/`, que el `vite` de desarrollo sirve como sirve el resto
// de `build/`. Así que la página lo trae y lo mete en el almacén:
//
//     http://localhost:5173/?personaje=veteran
//       → trae build/personajes/veteran.json
//       → `importar()` (el MISMO lector del botón «import from a file»)
//       → `almacen.escribir()`, y sale en «Choose your character»
//
// Esto NO es del juego: Master Sword no importa personajes de ningún sitio.
// Por eso lo llama main.js sólo con `import.meta.env.DEV`, que Vite pone a
// `false` al empaquetar (`npm run empaquetar`, la cáscara de escritorio): el
// parámetro no existe fuera del laboratorio.
//
// ── Por qué no se pisa cada vez ────────────────────────────────────────────
//
// Cambiar de mapa recarga la página CONSERVANDO la URL (main.js, `q.set("map")`
// + `location.search`), así que el `?personaje=` sobrevive al viaje. Importar
// a ciegas en cada carga devolvería al personaje a su estado de fábrica a
// mitad de partida —el oro gastado, otra vez entero—, sin un error. Se importa
// sólo si en el almacén no está, o si el fichero es OTRA fabricación (su
// `creado` es distinto: cada `npm run personaje` lo sella con la hora).

import { importar } from "../juego/almacen.js";

/** Lo que se acepta en `?personaje=`: un nombre de fichero, no una ruta. */
const NOMBRE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Importa el personaje de pruebas si la URL lo pide. Nunca lanza: lo que pasa
 * se devuelve y se escribe en la consola, y la pantalla de personajes sale
 * igual —un personaje de pruebas que no está no puede dejarte sin menú—.
 *
 * @param almacen  el de la sesión (`AlmacenLocal` o `AlmacenMemoria`)
 * @param buscar   `location.search`
 * @param traer    `fetch`, inyectable para la prueba de Node
 * @returns `{ hecho, porQue, id?, nombre? }`, o `null` si la URL no lo pide
 */
export async function importarPersonajeDePruebas({ almacen, buscar, traer = globalThis.fetch }) {
  const pedido = new URLSearchParams(buscar ?? "").get("personaje");
  if (pedido === null) return null;
  const decir = (r) => {
    console[r.hecho ? "log" : "warn"](`personaje de pruebas «${pedido}»: ${r.porQue}`);
    return r;
  };
  if (!NOMBRE.test(pedido)) return decir({ hecho: false, porQue: "el nombre sólo admite letras, dígitos, _ y -" });
  const ruta = `build/personajes/${pedido}.json`;
  let texto;
  try {
    const res = await traer(ruta);
    if (!res.ok) return decir({ hecho: false, porQue: `no está ${ruta} (corre \`npm run personaje\`)` });
    texto = await res.text();
  } catch (e) {
    return decir({ hecho: false, porQue: `no se pudo traer ${ruta}: ${e?.message ?? e}` });
  }
  let personaje;
  try {
    ({ personaje } = importar(texto));
  } catch (e) {
    return decir({ hecho: false, porQue: `${ruta} no es un personaje: ${e?.message ?? e}` });
  }
  const ya = await almacen.leer(personaje.id).catch(() => null);
  if (ya?.personaje && ya.personaje.creado === personaje.creado) {
    return decir({ hecho: false, porQue: "ya estaba importado (misma fabricación): no se pisa", id: personaje.id, nombre: personaje.nombre });
  }
  await almacen.escribir(personaje);
  return decir({ hecho: true, porQue: ya ? "reimportado: era otra fabricación" : "importado", id: personaje.id, nombre: personaje.nombre });
}
