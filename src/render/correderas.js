// LAS PUERTAS QUE SE CORREN: los `func_door`, que hasta el 70 no eran nada.
//
// Tres en Edana, cero en Gate City, y esta vez el punto de partida no es el de
// las otras dos clases que salieron del mundo. Una puerta rotatoria y un almiar
// estaban **horneados dentro del trimesh**: existían como pared. Una `func_door`
// no estaba ni eso. La malla de colisión es el modelo 0 más `func_wall`, así que
// las tres estaban sólo DIBUJADAS: la tapa de la cloaca de Edana era una lámina
// de cuatro unidades por la que se pasaba andando, y el sótano estaba abierto
// desde el primer día.
//
// Así que esto hace dos cosas que se cuentan por separado: **les da el
// colisionador que nunca tuvieron** y **las mueve**.
//
// ── Qué es de aquí y qué no ───────────────────────────────────────────────
//
// Ni una regla del motor. Cuándo se abre, cuánto tarda, cuánto espera arriba y
// a quién dispara al llegar están en `src/play/disparadores.js`, que es puro y
// cita línea a línea. Aquí se pregunta la fracción —`fraccionDePuerta(e, t)`,
// entre 0 y 1— y se coloca el nodo y el cuerpo cinemático. Es la frontera de
// siempre: **el movimiento es del motor, el choque es de Rapier.**
//
// ── Lo que NO hace, con la cuenta ─────────────────────────────────────────
//
// `CBaseDoor::Blocked` (doors.cpp:725-805): trabar una deslizante. Le toca a
// **0 de las tres** y el motivo está escrito en la cabecera de
// `src/play/disparadores.js` — las dos de la cloaca traen `wait -1`, y con
// espera negativa el motor no invierte, aplasta; y `door1`, que sí invertiría,
// no la puede abrir nadie. Un cuerpo cinemático que barre al jugador lo empuja
// y ya está, que es lo que hace el motor con `wait -1` menos el daño, y las dos
// traen `dmg 0`.
//
// El MODO DE DIBUJO del haz de luz. `sewerbeam` es `rendermode 5` —aditivo— con
// `renderamt 80`, y salir de la malla del mundo le quita el material
// transparente que allí tenía: montado aquí sale opaco. Es un pilar de luz de
// 128 × 144 × 276 unidades dentro de la cloaca, y se anota en vez de taparse.
// Lo que sí se respeta ya es `SF_DOOR_PASSABLE`: no lleva colisionador.

import * as THREE from "three";

/**
 * Monta un nodo y, si choca, un cuerpo cinemático por deslizante.
 *
 * `manifiesto` es `malla.json`; `bin` el `malla.bin` ya leído. Devuelve `null`
 * si el mapa no tiene ninguna, que es el caso de Gate City.
 */
export function montarCorrederas(manifiesto, bin, { materialDe, mundo = null, RAPIER = null } = {}) {
  const fichas = manifiesto.interactivas?.correderas ?? [];
  if (!fichas.length) return null;
  const T = manifiesto.bin.tramos;
  const grupo = new THREE.Group();
  grupo.name = "correderas";
  const correderas = [];
  const porEntidad = new Map();

  for (const f of fichas) {
    const arr = (k, Tipo) => {
      const t = T[`${f.tramo}${k}`];
      if (!t) throw new Error(`falta el tramo ${f.tramo}${k} en malla.bin`);
      return new Tipo(bin, t.off, t.n);
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr("Positions", Float32Array), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(arr("Normals", Float32Array), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(arr("Uvs", Float32Array), 2));
    geo.setAttribute("uv1", new THREE.BufferAttribute(arr("Uvs1", Float32Array), 2));
    geo.setIndex(new THREE.BufferAttribute(arr("Indices", Uint32Array), 1));
    const materiales = [];
    f.grupos.forEach((g, i) => {
      geo.addGroup(g.start, g.count, i);
      materiales.push(materialDe(g));
    });
    geo.computeBoundingSphere();

    const malla = new THREE.Mesh(geo, materiales);
    const nodo = new THREE.Group();
    nodo.add(malla);
    grupo.add(nodo);

    // Cinemático porque se mueve y porque quien manda es el reloj de la puerta
    // y no la física — igual que las rotatorias del 48. Y sin colisionador si
    // trae `SF_DOOR_PASSABLE`: el haz de luz no para a nadie.
    let cuerpo = null, colisionador = null;
    if (mundo && RAPIER && !f.atravesable) {
      cuerpo = mundo.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      colisionador = mundo.createCollider(
        RAPIER.ColliderDesc.trimesh(arr("ChoquePositions", Float32Array), arr("ChoqueIndices", Uint32Array)),
        cuerpo
      );
    }

    const c = { ficha: f, nodo, malla, cuerpo, colisionador, fraccion: -1 };
    correderas.push(c);
    porEntidad.set(f.entidad, c);
  }

  /**
   * DÓNDE CAE la hoja para una fracción dada, en metros de escena.
   *
   * `SF_DOOR_START_OPEN` da la vuelta al recorrido y no es un caso inventado
   * para quedar bien: el motor coloca la puerta en `m_vecPosition2` y **luego
   * intercambia las dos posiciones** (doors.cpp:302-310), así que nace en
   * `TS_AT_BOTTOM` con la hoja en la otra punta y «abrirla» la trae de vuelta.
   * Le toca a **0 de las tres de Edana**; está escrito porque la alternativa
   * —no escribirlo— es una puerta que el primer mapa que traiga la bandera
   * dibuja en el sitio equivocado sin dar un error.
   */
  const desplazamiento = (c, fr) => {
    const f = c.ficha;
    const t = f.empiezaAbierta ? 1 - fr : fr;
    return [
      f.ancla[0] + f.direccion[0] * f.recorrido * t,
      f.ancla[1] + f.direccion[1] * f.recorrido * t,
      f.ancla[2] + f.direccion[2] * f.recorrido * t,
    ];
  };

  const colocar = (c, fr) => {
    // Comparar antes de escribir no es una optimización de adorno: escribir un
    // `setNextKinematicTranslation` cada fotograma con el mismo valor le dice a
    // Rapier que el cuerpo se mueve a velocidad cero, que es lo que ya hay, pero
    // también reactiva el cuerpo y el de al lado en cada paso.
    if (c.fraccion === fr) return;
    c.fraccion = fr;
    const p = desplazamiento(c, fr);
    c.nodo.position.set(p[0], p[1], p[2]);
    if (c.cuerpo) c.cuerpo.setNextKinematicTranslation({ x: p[0], y: p[1], z: p[2] });
  };
  for (const c of correderas) colocar(c, 0);

  return {
    grupo, correderas, porEntidad,
    n: correderas.length,
    triangulos: fichas.reduce((a, f) => a + f.triangulos, 0),

    de(entidad) { return porEntidad.get(entidad) ?? null; },

    /**
     * Un paso: le pregunta al bus dónde va cada hoja y la pone ahí.
     *
     * `fraccionDe(entidad)` es lo que devuelve `Disparadores.fraccionDePuerta`
     * para esa entidad del `.bsp`. Se pregunta y no se guarda: el estado de la
     * puerta es del bus y tenerlo en dos sitios es la costura del 63.
     */
    tic(fraccionDe) {
      for (const c of correderas) {
        const fr = fraccionDe(c.ficha.entidad);
        if (Number.isFinite(fr)) colocar(c, fr);
      }
    },

    /** Dónde está cada una, para la sonda. En metros y con su fracción. */
    censo() {
      return correderas.map((c) => ({
        entidad: c.ficha.entidad,
        nombre: c.ficha.nombre,
        fraccion: c.fraccion,
        choca: Boolean(c.colisionador),
        posicion: [c.nodo.position.x, c.nodo.position.y, c.nodo.position.z],
        recorrido: c.ficha.recorrido,
      }));
    },

    /** Cuántas están abiertas del todo. Se calcula, no se escribe. */
    get abiertas() { return correderas.filter((c) => c.fraccion >= 1).length; },

    /**
     * Las asas de Rapier de sus colisionadores — el 75.
     *
     * Una `func_door` es `SOLID_BSP`, así que **un objeto que se queda encima de
     * la tapa de la cloaca no toca suelo** para el motor: `SV_PointContents` sólo
     * mira el hull del mundo y las entidades `SOLID_NOT` (world.cpp:625-626 y
     * 695-709). No se tumba, no suena y caduca desde que lo soltaron.
     */
    asas() {
      return correderas.filter((c) => c.colisionador).map((c) => c.colisionador.handle);
    },
  };
}
