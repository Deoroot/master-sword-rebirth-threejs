// LO QUE SE ROMPE: los `func_breakable`, que hasta el 69 eran pared.
//
// Veinte entidades entre los dos mapas —4 almiares en Edana, 16 en Gate City—
// horneadas dentro del trimesh del mundo. Existían como dibujo y como obstáculo
// y no como algo que se rompe, que es la mitad de para qué están puestas: el
// almiar de 8 de vida abre la cloaca de Edana y cuatro cajas de Gate City
// sueltan las crías de rata.
//
// El molde es el de `src/play/puertas.js` y por la misma razón: **quien sale del
// trimesh del mundo tiene que traerse su malla y su colisionador**, o deja un
// agujero por el que se pasa andando. Un rompible es más fácil que una puerta
// porque no gira, así que su malla va en coordenadas del mundo y su cuerpo es
// fijo.
//
// ── La frontera ───────────────────────────────────────────────────────────
//
// Aquí no hay ni una regla del motor: la vida, el material, las banderas y a
// quién dispara al romperse están en `src/play/disparadores.js`, que es puro y
// cita línea a línea. Esto sólo dibuja, choca y **deja de chocar**.
//
// Y ese «deja de chocar» es todo lo que hace `CBreakable::Die` de este lado:
//
//     pev->solid = SOLID_NOT;                          func_break.cpp:823
//     SetThink(&CBaseEntity::SUB_Remove);
//     pev->nextthink = pev->ltime + 0.1;               func_break.cpp:826-827
//
// O sea que deja de estorbar **en el acto** y desaparece una décima después. Se
// hacen las dos cosas y no una: quitar sólo el colisionador deja un almiar
// fantasma dibujado en el aire, y quitar sólo la malla deja una pared invisible.

import * as THREE from "three";

/**
 * Monta un nodo y un colisionador por rompible.
 *
 * `manifiesto` es `malla.json`; `bin` el `malla.bin` ya leído. Devuelve `null`
 * si el mapa no tiene ninguno — que no es un caso raro: lo será el primer mapa
 * sin almiares.
 */
export function montarRompibles(manifiesto, bin, { materialDe, mundo = null, RAPIER = null } = {}) {
  const fichas = manifiesto.interactivas?.rompibles ?? [];
  if (!fichas.length) return null;
  const T = manifiesto.bin.tramos;
  const grupo = new THREE.Group();
  grupo.name = "rompibles";
  const rompibles = [];
  /** Por índice de entidad, que es por donde los nombra el bus. */
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
    // El nodo va en el ancla y la malla es local a ella, igual que la bisagra de
    // una puerta. Ninguno de los veinte trae `origin`, así que el ancla es el
    // cero y esto no resta nada — pero si un mapa lo trae, ya está resuelto.
    const nodo = new THREE.Group();
    nodo.position.set(f.ancla[0], f.ancla[1], f.ancla[2]);
    nodo.add(malla);
    grupo.add(nodo);

    // El cuerpo es FIJO y no cinemático: un rompible no se mueve nunca. Lo que
    // hace falta es poder quitarlo, y para eso se guarda el colisionador.
    let cuerpo = null, colisionador = null;
    if (mundo && RAPIER) {
      cuerpo = mundo.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(f.ancla[0], f.ancla[1], f.ancla[2])
      );
      colisionador = mundo.createCollider(
        RAPIER.ColliderDesc.trimesh(arr("ChoquePositions", Float32Array), arr("ChoqueIndices", Uint32Array)),
        cuerpo
      );
    }

    const r = { ficha: f, nodo, malla, cuerpo, colisionador, roto: false };
    rompibles.push(r);
    porEntidad.set(f.entidad, r);
  }

  return {
    grupo, rompibles, porEntidad,
    n: rompibles.length,
    triangulos: fichas.reduce((a, f) => a + f.triangulos, 0),

    /** El de esa entidad del `.bsp`, o `null`. */
    de(entidad) { return porEntidad.get(entidad) ?? null; },

    /**
     * EL CENTRO de cada uno que siga en pie, en metros, para que el golpe pueda
     * elegirlo como elige un bicho.
     *
     * Se devuelve con la forma que pide `elegirObjetivo` —`{ centro, vivo }`—
     * para no tener un segundo cono de ataque al lado del de la espada. Tener
     * dos conos sería tener dos alcances, y el que mediría la sonda sería el
     * equivocado.
     *
     * Y `unidadesPorMetro` no tiene valor por omisión útil: la `caja` del
     * manifiesto está en metros de escena y **el cono del golpe mide en unidades
     * de GoldSrc**, porque el `alcance` del arma viene del guion. Sin convertir,
     * un almiar a tres metros sale a tres unidades del jugador y se rompe sin
     * acercarse — que no da error, da un pueblo que se derrumba al mirarlo.
     */
    candidatos({ unidadesPorMetro = 39.37 } = {}) {
      const u = unidadesPorMetro;
      return rompibles.filter((r) => !r.roto).map((r) => ({
        centro: [
          ((r.ficha.caja.min[0] + r.ficha.caja.max[0]) / 2) * u,
          ((r.ficha.caja.min[1] + r.ficha.caja.max[1]) / 2) * u,
          ((r.ficha.caja.min[2] + r.ficha.caja.max[2]) / 2) * u,
        ],
        vivo: true,
        rompible: r,
        entidad: r.ficha.entidad,
      }));
    },

    /**
     * Lo rompe de este lado: deja de chocar y deja de verse.
     *
     * Quien decide QUE se rompe es el bus; esto no mira vida ni banderas. Y
     * devuelve si ha hecho algo, para que una llamada repetida no cuente dos
     * veces.
     */
    romper(entidad) {
      const r = porEntidad.get(entidad);
      if (!r || r.roto) return false;
      r.roto = true;
      // Primero deja de estorbar, que es lo inmediato en el motor.
      if (r.colisionador && mundo) { mundo.removeCollider(r.colisionador, false); r.colisionador = null; }
      if (r.cuerpo && mundo) { mundo.removeRigidBody(r.cuerpo); r.cuerpo = null; }
      // Y se va. `visible = false` y no `remove()`: la geometría y los
      // materiales son los del atlas del mapa y se comparten.
      r.nodo.visible = false;
      return true;
    },

    /** Cuántos quedan en pie. Se calcula, no se escribe. */
    get enPie() { return rompibles.filter((r) => !r.roto).length; },

    /**
     * Las asas de Rapier de sus colisionadores — el 75.
     *
     * Un `func_breakable` es una entidad de brush, y a un objeto que se queda
     * encima de una **el motor no le da `FL_ONGROUND`**: `SV_PointContents` mira
     * el hull del mundo y de las entidades sólo las `SOLID_NOT` (world.cpp:625-626
     * y 695-709). Así que quien traza la caída necesita saber contra qué ha
     * chocado, y esto es la lista.
     */
    asas() {
      return rompibles.filter((r) => r.colisionador).map((r) => r.colisionador.handle);
    },
  };
}
