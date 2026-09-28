// UN SUELO LISO, para probar la red sin un mapa delante.
//
// Dos triángulos de 200 × 200 m y la misma física de siempre. No es un mundo de
// mentira: es `World` y `Player` de verdad, con el perfil de Master Sword —o
// sea con su aceleración, su fricción y su salto—; lo único de mentira es la
// geometría.
//
// Y eso es a propósito. Una prueba de red que sustituyera la física por «suma
// la velocidad por el tiempo» comprobaría que el protocolo funciona con una
// física que no es la del juego, que es justo donde vive la diferencia entre
// predecir bien y predecir casi.

import { World, Player, perfilMsr, initPhysics } from "../play/player.js";

/** La malla: un cuadrado en y = 0, con la normal hacia arriba. */
export function suelo(lado = 200) {
  const m = lado / 2;
  return {
    positions: new Float32Array([-m, 0, -m, m, 0, -m, m, 0, m, -m, 0, m]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
    triangleCount: 2,
  };
}

export async function mundoLiso({ lado = 200, unidadesPorMetro = 39.37 } = {}) {
  await initPhysics();
  const perfil = perfilMsr(unidadesPorMetro);
  const world = new World(suelo(lado), { perfil });
  return {
    world,
    perfil,
    triangulos: 2,
    crearCuerpo(pies) { return new Player(world, pies, { perfil }); },
    soltarCuerpo(cuerpo) { try { world.world.removeRigidBody(cuerpo.body); } catch { /* ya no estaba */ } },
  };
}
