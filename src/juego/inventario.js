// EL PESO, que es lo único que Master Sword usa para limitar lo que llevas.
//
//     Volume() = min( STR × 25 + 25, 2000 )
//
// Aquí había además una REJILLA estilo Diablo, de 10×6, con una huella por
// objeto sacada de su `size`. Era nuestra, estaba declarada como nuestra desde
// el primer día —«la primera decisión de este proyecto que se aparta del
// original a propósito»— y se retiró en el experimento 31, cuando se portó el
// inventario de verdad (`src/vgui/contenedor.js`).
//
// Lo que MSR guarda es **una lista de hasta cien objetos** (`NUM_MAX_ITEMS 100`)
// y dos manos (`MAX_PLAYER_HANDS 2`). No hay casillas. Lo que limita es el peso,
// y eso es lo que queda en este archivo.

/** El peso que lleva encima, y si se pasa de lo que puede cargar. */
export function carga(objetos, capacidad) {
  const peso = objetos.reduce((s, o) => s + (o.ficha?.peso ?? 0) * (o.n ?? 1), 0);
  return { peso, capacidad, pasado: peso > capacidad, fraccion: capacidad ? peso / capacidad : 0 };
}
