// CÓMO SE EMPAQUETA EL JUEGO.
//
// Va en un `.cjs` y no en `package.json` para poder escribir esto: cada decisión
// de aquí abajo tiene un motivo que no se deduce leyendo la clave.
//
// ── LA REGLA QUE MANDA SOBRE TODAS: qué NO entra ───────────────────────────
//
// **`build/` no se empaqueta.** Ahí vive el contenido extraído de Master Sword
// —texturas, modelos, sonidos, el `.bsp`—, y meterlo dentro del ejecutable sería
// redistribuirlo. El permiso no está pedido (ver `CREDITOS.md`), así que la
// carpeta se queda FUERA y el juego la busca al lado del `.exe`:
//
//     const CONTENIDO = app.isPackaged ? dirname(app.getPath("exe")) : PROYECTO;
//                                     escritorio/main.cjs
//
// Que es además cómo se reparte el original: el ejecutable por un lado y el
// contenido del mod por otro. Lo confirmó el jugador: *«el contenido, dlls va
// fuera del ejecutable como en el juego original»*.
//
// `files` es por tanto una lista BLANCA y no una negra. Con una negra, el día
// que aparezca una carpeta nueva con contenido dentro se empaquetaría sola y
// nadie se enteraría; con una blanca, lo que no esté escrito no entra.
//
// ── Qué hace falta de verdad para correr ───────────────────────────────────
//
// Sorprendentemente poco, y conviene saber por qué: **la rama de producción no
// usa un solo paquete de `node_modules`**. `escritorio/servidor.js` importa sólo
// módulos de Node, `precarga.cjs` sólo `electron`, y `main.cjs` en producción no
// levanta Vite —eso es la rama de desarrollo—. Así que el paquete es `dist/`
// (el juego compilado por Vite) y `escritorio/` (la cáscara), y nada más.
//
// Si algún día algo de `escritorio/` necesita una dependencia de verdad, esto
// deja de ser cierto y hay que decirlo aquí.
//
// ── Y UNA LISTA BLANCA NO BASTA PARA DEJAR FUERA `node_modules` ────────────
//
// Esto se midió, no se supuso: con `files` diciendo sólo `escritorio`, `dist` y
// `package.json`, el primer paquete salió **con `node_modules` dentro** —`three`
// y `@dimforge/rapier3d-compat`, 19 MB—. electron-builder añade las
// `dependencies` de producción por su cuenta, porque para una aplicación normal
// de Electron eso es lo correcto: su proceso principal las necesita.
//
// Aquí no. Las dos están **ya dentro** de `dist/assets/index-*.js`, que es lo
// que Vite compila; en el paquete eran una segunda copia que nadie importa. Hay
// que decir que no explícitamente, y por eso está el `!node_modules` de abajo.
//
// Es la trampa del apartado 4 de `CLAUDE.md` con otra ropa: una lista blanca que
// parece exhaustiva y tiene una regla por debajo que añade cosas. Lo que la
// destapó fue mirar el `resources/app/` del paquete, no leer la configuración.

// EL ICONO, que es contenido del juego y por eso se trata como tal.
//
// `../MSC/assets/msr/game.ico` es el icono de Master Sword: Rebirth. **No se
// copia al repositorio** —sería el primer binario del juego dentro, y
// `test/procedencia.test.mjs` lo rechazaría con razón—: se apunta a él donde
// vive, al lado, igual que se hace con todo lo demás del juego.
//
// Y si no está, no pasa nada: se empaqueta con el icono de Electron. Quien no
// tenga la instalación al lado tiene que poder construir el ejecutable igual,
// que es la misma regla que hace que el juego arranque sin `build/`.
//
// LO QUE ESTO IMPLICA, Y NO LO DECIDE ESTE ARCHIVO: un `.exe` con este icono
// dentro **lleva incrustado un asset del juego**. Mientras el ejecutable no se
// reparta, es lo mismo que leer `build/` del disco; en cuanto se reparta, es
// redistribuir, y eso es lo que `CREDITOS.md` dice que no se hace sin permiso.
// Queda anotado aquí para que la decisión sea de alguien y no del olvido.
// Y NO SE APUNTA AL ORIGINAL, sino al ampliado. El del juego mide 32x32 —los
// iconos medían eso cuando se hizo— y electron-builder exige 256x256:
//
//     ⨯ Icon must be at least 256x256 pixels, provided: 32x32
//
// `tools/icono.mjs` lo amplía x8 por vecino más cercano —sin inventar un solo
// píxel— y lo deja en `build/icono/`, con su `PROCEDENCIA.md` al lado, que es
// donde va todo lo derivado del juego.
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const ICONO = join(__dirname, "build", "icono", "msr-256.ico");
const hayIcono = existsSync(ICONO);
if (!hayIcono) {
  console.warn("  (sin icono del juego: corre `node tools/icono.mjs`. " +
    "Se empaqueta con el de Electron.)");
}

module.exports = {
  appId: "org.msrebirth.threejs",
  // El nombre del `.exe` y de la carpeta. Sin dos puntos: Windows no los
  // admite en un nombre de archivo y el empaquetado falla tarde y mal.
  productName: "Master Sword Rebirth",

  directories: { output: "empaquetado" },

  // LISTA BLANCA. Ver arriba: `build/` no está, y no está a propósito.
  files: [
    "escritorio/**/*",
    "dist/**/*",
    "package.json",
    // Y el «no» explícito, que no sobra: ver la nota de arriba. Sin esta línea
    // el paquete se lleva una segunda copia de Three y de Rapier que ya están
    // compiladas dentro de `dist/`.
    "!node_modules/**/*",
  ],

  // EL ASAR SE QUEDA DESACTIVADO, y no es por comodidad.
  //
  // `escritorio/servidor.js` sirve los archivos con `createReadStream` y
  // responde a peticiones `Range` leyendo `size` de un `stat`. Electron parchea
  // `fs` para leer dentro de un `.asar`, pero es un parche: los `Range` del
  // audio y los flujos a medio leer son justo el terreno donde un parche se
  // comporta distinto del original, y eso se pagaría en un fallo intermitente
  // de sonido dentro de un `.exe` sin consola.
  //
  // Lo que se gana activándolo es un arranque algo más rápido y un árbol de
  // archivos menos visible. Ninguna de las dos cosas vale ese riesgo hoy. Si
  // algún día se activa, se activa **midiendo el audio con un `Range`**, que es
  // lo que puede romperse.
  asar: false,

  win: {
    // `dir` = una carpeta que se copia y se ejecuta, sin instalador.
    //
    // Un instalador tendría que decidir dónde pone `build/`, y la respuesta
    // correcta —«al lado del ejecutable, y lo trae el jugador»— es justo la que
    // un instalador no sabe dar. Una carpeta portátil es lo que corresponde a un
    // juego cuyo contenido no se distribuye con él.
    target: [{ target: "dir", arch: ["x64"] }],
    ...(hayIcono ? { icon: ICONO } : {}),
  },

  // Sin firma de código: no hay certificado, y firmar con uno inventado es peor
  // que no firmar. Windows avisará la primera vez; eso es correcto y honesto.
  forceCodeSigning: false,
};
