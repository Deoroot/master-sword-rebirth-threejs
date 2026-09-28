// LO QUE CHOCA Y NO ES EL MAPA: los adornos y los bichos.
//
// Hasta ahora sólo chocaba el `.bsp`. Se andaba a través del barril, de la
// silla y del goblin — y eso no se ve como un fallo de física: se ve como que
// el mundo es una foto.
//
// ── Y lo primero es que NO todos chocan, y lo dice el mod ──────────────────
//
// Un `env_model` sólo es sólido si su entidad trae `dmg`:
//
//     msmapents.cpp:311   if (pev->dmg) {
//                           pev->solid = SOLID_SLIDEBOX;
//                           UTIL_SetSize(pev, vMins, vMaxs);
//                         }
//
// En Gate City eso son **76 de los 91** adornos quietos. Los otros quince
// —helechos, flores, el carro, la carreta, los troncos de la chimenea— se
// atraviesan en el juego original también. Ponerles colisión habría sido
// «arreglar» algo que no está roto, y el jugador se habría quedado enganchado
// en un helecho.
//
// Y el tamaño tampoco se deduce del modelo: es el `mins`/`maxs` que escribió el
// mapeador en la entidad. Un barril de 32×32×36 unidades tiene una caja más
// pequeña que su malla, a propósito, para que no estorbe al pasar.
//
// ── Por qué cajas y no la malla ────────────────────────────────────────────
//
// Porque es lo que hace el motor: `SOLID_SLIDEBOX` es una CAJA, no un trimesh.
// Usar la malla del modelo sería más preciso que el original y más caro, y
// además cambiaría cómo se anda entre las sillas de la taberna.

/**
 * Pone un colisionador fijo por cada adorno sólido.
 *
 * `manifiesto` es `malla.json`. Devuelve `null` si no hay ninguno.
 */
export function solidosDeAdornos(manifiesto, mundo, RAPIER) {
  const colocaciones = manifiesto.adornos?.colocaciones ?? [];
  const solidos = colocaciones.filter((c) => c.solido);
  if (!solidos.length) return null;
  const puestos = [];
  for (const c of solidos) {
    const s = c.solido;
    const medio = [0, 1, 2].map((k) => (s.max[k] - s.min[k]) / 2);
    const centro = [0, 1, 2].map((k) => (s.max[k] + s.min[k]) / 2);
    // Una caja de lado cero no es un obstáculo: es un colisionador degenerado
    // que Rapier acepta y que no choca con nada. Mejor no ponerlo que ponerlo
    // y creer que está.
    if (medio.some((m) => m <= 0)) continue;
    const cuerpo = mundo.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(centro[0], centro[1], centro[2])
    );
    const col = mundo.createCollider(
      RAPIER.ColliderDesc.cuboid(medio[0], medio[1], medio[2]), cuerpo
    );
    puestos.push({ modelo: c.modelo, caja: s, cuerpo, colisionador: col });
  }
  return {
    n: puestos.length,
    deCuantos: colocaciones.length,
    puestos,
    /** Los que NO chocan, que es la mitad interesante del dato. */
    atravesables: colocaciones.length - solidos.length,
  };
}

/**
 * Y los BICHOS: un cilindro por cada uno, del tamaño que dice su caja.
 *
 * El motor los hace `SOLID_SLIDEBOX` con el casco que les da su script. Aquí el
 * tamaño sale de la caja del propio `.mdl` —que `tools/bicho.mjs` ya escribe—
 * recortada al ALTO y al RADIO, porque una caja de modelo incluye los brazos
 * extendidos de alguna animación y eso haría a un goblin el doble de ancho de
 * lo que parece.
 *
 * Son cuerpos CINEMÁTICOS y no fijos porque el paseo los mueve, y su
 * colisionador los tiene que seguir. Quien los mueva llama a `seguir()`.
 */
export function solidosDeBichos(bichos, mundo, RAPIER, { unidadesPorMetro = 39.37 } = {}) {
  if (!bichos?.instancias?.length) return null;
  const puestos = [];
  for (const i of bichos.instancias) {
    const caja = i.caja ?? null;
    // Sin caja no se inventa una: se deja pasar y se cuenta, que es más
    // honesto que darle a un bicho un tamaño que nadie ha medido.
    if (!caja) continue;
    const alto = (caja.max[2] - caja.min[2]) / unidadesPorMetro;
    const anchoX = (caja.max[0] - caja.min[0]) / unidadesPorMetro;
    const anchoY = (caja.max[1] - caja.min[1]) / unidadesPorMetro;
    const radio = Math.min(anchoX, anchoY) / 2;
    if (!(alto > 0) || !(radio > 0)) continue;
    const cuerpo = mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = mundo.createCollider(
      // Un cilindro y no una caja: un bicho que gira no cambia de anchura, y
      // con una caja sí — se vería como que el goblin ocupa más de lado.
      RAPIER.ColliderDesc.cylinder(alto / 2, radio), cuerpo
    );
    puestos.push({ instancia: i, cuerpo, colisionador: col, alto, radio });
  }
  if (!puestos.length) return null;
  const seguir = () => {
    for (const p of puestos) {
      // `donde` y no `nodo.position`: desde el 28 la posición de un bicho vive
      // en la manada, sin Three, y por eso este archivo entero sirve igual en el
      // servidor — que es quien ahora los mueve.
      const n = p.instancia.donde;
      p.cuerpo.setNextKinematicTranslation({ x: n[0], y: n[1] + p.alto / 2, z: n[2] });
    }
  };
  seguir();
  return {
    n: puestos.length, deCuantos: bichos.instancias.length, puestos, seguir,
    /**
     * Quitarle el cilindro a uno, que es lo que hace falta al morir.
     *
     * El motor lo dice con una línea: `pev->solid = SOLID_NOT` en
     * `SUB_StartFadeOut` (combat.cpp:642). Sin esto el cadáver sigue siendo un
     * muro invisible en medio de la calle, y eso no se ve: se choca.
     */
    quitar(instancia) {
      const k = puestos.findIndex((p) => p.instancia === instancia);
      if (k < 0) return false;
      mundo.removeRigidBody(puestos[k].cuerpo);
      puestos.splice(k, 1);
      return true;
    },
  };
}
