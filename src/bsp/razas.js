// LAS RAZAS: la tabla que decide quién te ataca, sin tocar el disco.
//
// Está separada de `script.js` a propósito, y el motivo salió de un fallo:
// `script.js` lee ficheros con `node:fs`, y en cuanto la IA del navegador lo
// importó —aunque sólo fuera por dos constantes— **Vite externalizó `node:fs`
// y la página dejó de cargar entera**. El error no dice «no importes esto»,
// dice «Module node:fs has been externalized», y aparece antes de que exista
// `window.probe`, así que la sonda se queda esperando cuatro minutos.
//
// Aquí está la LÓGICA, que es pura y vale en los dos lados. En `script.js`
// queda sólo leer el fichero.

/** La raza del jugador. No sale de ningún script: la devuelve el motor. */
//
// `script.cpp:1546   else if (Prop == "race") return "human";`
export const RAZA_DEL_JUGADOR = "human";

/** Los valores de `relationship_e` (races.h:8). */
export const RELACION = {
  NEMESIS: -5, ODIO: -4, DESPRECIO: -3, RECELO: -2, MIEDO: -1,
  NEUTRAL: 0, ALIADO: 1, SIN_RAZA: 2,
};

/** `all` vale por cualquiera; `none` no vale por nadie (no está en la lista). */
const contiene = (lista, raza) => lista.some((r) => r === "all" || r === raza);

/**
 * La relación de `origen` hacia `objetivo`, con **el orden del motor**
 * (`races.cpp:45`), que no es el que parece:
 *
 *   1. recelo, y basta con que UNO de los dos recele del otro
 *   2. aliado
 *   3. enemigo
 *
 * El orden importa y mucho: la raza `human` tiene `enemies all;hated` y
 * `allies human;beloved`, y el jugador es humano. Mirando los enemigos
 * primero, **el pueblo entero te ataca** — y por eso el comentario de
 * `races.script` dice «this race can't attack players».
 *
 * Y el recelo gana a todo: `hguard` recela de `human`, así que los guardias no
 * te atacan aunque tengan a medio mundo en su lista de enemigos.
 */
export function relacionDeRazas(tabla, origen, objetivo) {
  const a = tabla?.get(String(origen ?? "").toLowerCase());
  const b = tabla?.get(String(objetivo ?? "").toLowerCase());
  if (!a || !b) return RELACION.SIN_RAZA;
  if (contiene(a.recelo, b.nombre) || contiene(b.recelo, a.nombre)) return RELACION.RECELO;
  if (contiene(a.aliados, b.nombre)) return RELACION.ALIADO;
  if (contiene(a.enemigos, b.nombre)) return RELACION.ODIO;
  return RELACION.NEUTRAL;
}

/**
 * ¿Ve `$cansee(enemy)` a este objetivo?
 *
 * **El recelo NO cuenta**, y es la trampa: vale −2, o sea negativo, así que
 * «relación < 0» daría que sí. El motor no compara: usa un `switch` con
 * cuatro casos concretos (`npcscript.cpp:1806`) y RECELO no está entre ellos.
 * «Sólo ataca si le atacas» es justo lo que significa.
 */
export function esEnemigo(relacion) {
  return relacion === RELACION.MIEDO || relacion === RELACION.DESPRECIO ||
         relacion === RELACION.ODIO || relacion === RELACION.NEMESIS;
}
