// LA CONFIGURACIÓN DEL `vite` DE LAS SONDAS — el 98.
//
// El proyecto no tiene `vite.config`: `npm run dev` usa los valores por
// omisión, y eso no cambia. Esta configuración la usa sólo `arrancarVite` /
// `lanzarVite` (sondas/mismo.mjs), y se diferencia en dos cosas:
//
// 1. SIN RECARGA EN CALIENTE NI VIGILANCIA DE ARCHIVOS. El árbol lo comparten
//    varias sesiones, y una que guarda un archivo recargaba la página de la
//    sonda a media medida: `red95` se cayó el 98 con «Execution context was
//    destroyed» y `costurared92` perdió un control así, en la misma tanda. Unas
//    cuantas sondas ya lo cortaban a mano en el navegador (el 93, con un
//    `WebSocket` falso); esto lo corta en el servidor para todas. Y una sonda no
//    necesita ver cambios: mide el árbol tal como estaba al arrancar. De paso,
//    tres `vite` a la vez dejan de vigilar cada uno el árbol entero, que es lo
//    que el 98 encontró multiplicado por 54 en los huérfanos.
//
// 2. SU PROPIA CACHÉ DE DEPENDENCIAS. Vite guarda el preempaquetado en
//    `node_modules/.vite` con un hash que incluye la configuración; si las
//    sondas compartieran caché con `npm run dev`, cada cambio de una a otra la
//    invalidaría, y un preempaquetado nuevo a media carga recarga la página.

export default {
  cacheDir: "node_modules/.vite-sondas",
  server: {
    hmr: false,
    watch: { ignored: ["**/*"] },
  },
};
