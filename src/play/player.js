// El jugador en primera persona, sobre Rapier y sin Three.js.
//
// Que este archivo no importe Three.js es la mitad del experimento: permite
// que caminar, subir escalones y caerse se comprueben en Node plano, sin
// navegador y sin ojos. Si esto dejara de ser cierto, el veredicto automatico
// se pierde y la pregunta del experimento 03 ya tiene respuesta.

import RAPIER from "@dimforge/rapier3d-compat";
import {
  MOVEVARS, CAJA, velocidadDeSalto, pasoDeVelocidad, danoDeCaida,
  nadar, trepar, NADANDO, velocidadContraPlanos,
} from "./movimiento.js";

const U = 1 / 32; // una unidad de Quake en metros

// Las cifras vienen del experimento 02, en unidades, y se convierten aqui.
// La del escalon es la que costo cara: 16 unidades. En metros son 0,5, y si
// autostep se queda corto el jugador se atasca en cada peldano sin que nada
// lo avise: no falla, solo deja de subir.
//
// ── AVISO: ESTE PERFIL NO ES EL DE GOLDSRC, Y NO ES UNA ELECCION ──────────
//
// Son las cifras de Quake a **32 unidades por metro**, y este proyecto ya
// midio que GoldSrc son **39,37**. En Corinth, el jharro y el pueblo da igual
// —son mundos nuestros y esta es su escala— pero aplicarlo a Gate City hace
// al jugador un **23 % mas grande y un 23 % mas rapido** de lo que el mapa
// espera, y ademas con el alto, el ojo y el escalon equivocados:
//
//              nuestro          Master Sword
//     alto     56 u = 1,75 m    72 u = 1,83 m
//     ojo      56 u = 1,75 m    64 u = 1,63 m   (36 del centro + 28 de VEC_VIEW)
//     escalon  16 u = 0,50 m    18 u = 0,46 m   (sv_stepsize es 18, no 16)
//
// Eso no se ve como un fallo: se ve como un mapa un poco pequeno. Para Gate
// City se usa `perfilMsr()`, que esta debajo.
export const PLAYER = {
  radius: 16 * U,        // 0,50 m  (la caja de Quake es de 32 unidades de lado)
  height: 56 * U,        // 1,75 m  de los pies a los ojos
  eye: 56 * U,
  stepHeight: 16 * U,    // 0,50 m
  maxSlopeDeg: 46,
  walkSpeed: 160 * U,    // 5,0 m/s, la velocidad de marcha de Quake
  gravity: 800 * U,      // 25 m/s2, tambien la de Quake, no la de la Tierra
  skin: 0.02,
  snapToGround: 8 * U,
  jumpSpeed: 270 * U,   // 8,4 m/s, el salto de Quake
  stick: 64 * U,        // 2 m/s hacia abajo mientras se anda: ver step()
};

/**
 * El perfil de Master Sword, construido desde `movimiento.js`.
 *
 * Todo sale de las constantes del motor y se convierte aqui, en un solo sitio,
 * con las unidades por metro que declare el mapa. `msr: true` es lo que hace
 * que `Player.step()` coja el camino nuevo: friccion, aceleracion, control en
 * el aire y salto del motor, en vez del movimiento a velocidad constante.
 *
 * El escalon merece una nota: **18 unidades**, no 16. Con 16 el jugador se
 * queda atascado en cada peldano de 17 o 18 unidades, que en un mapa de
 * GoldSrc son casi todos — y no da error, solo deja de subir.
 */
export function perfilMsr(unidadesPorMetro = 39.37) {
  const u = 1 / unidadesPorMetro;
  return {
    msr: true,
    unidadesPorMetro,
    radius: (CAJA.ancho / 2) * u,
    height: CAJA.alto * u,
    eye: CAJA.ojo * u,
    heightDucked: CAJA.altoAgachado * u,
    eyeDucked: CAJA.ojoAgachado * u,
    stepHeight: MOVEVARS.escalon * u,
    // Los 46 grados son NUESTROS y siguen siendolo: GoldSrc no tiene un angulo
    // maximo de pendiente, tiene la regla de `plane.normal[2] < 0.7` en
    // `PM_CatagorizePosition`, que son 45,57 grados. Los 46 de Corinth estaban
    // a medio grado de la cifra real sin saberlo.
    maxSlopeDeg: 45.57,
    gravity: MOVEVARS.gravedad * u,
    skin: 0.02,
    snapToGround: 8 * u,
    jumpSpeed: velocidadDeSalto() * u,
    stick: 64 * u,
    // La velocidad la pone el PERSONAJE, no el perfil: sale de su agilidad y
    // de lo que cargue. Esto es solo el valor de un personaje sin nada.
    walkSpeed: 160 * u,
  };
}

/** El angulo de pendiente de GoldSrc, que no es un angulo sino una normal. */
export const NORMAL_DE_SUELO = 0.7;   // PM_CatagorizePosition

let ready = null;

/** Rapier es WASM y hay que esperarlo una vez por proceso. */
export async function initPhysics() {
  if (!ready) ready = RAPIER.init();
  await ready;
  return RAPIER;
}

export class World {
  /**
   * @param {{positions: Float32Array, indices: Uint32Array}} mesh
   * @param {{perfil?: object}} opciones
   *
   * `perfil` por defecto es el de Quake, que es lo que quieren Corinth, el
   * jharro y el pueblo. Gate City pasa `perfilMsr(level.unitsPerMetre)`.
   */
  constructor(mesh, { perfil = PLAYER } = {}) {
    if (mesh.triangleCount === 0) {
      // Un mundo vacio no colisiona con nada y el jugador cae para siempre.
      // Es el equivalente en fisica del 'exit 0 no significa correcto'.
      throw new Error("la malla de colision no tiene ni un triangulo");
    }
    this.perfil = perfil;
    this.world = new RAPIER.World({ x: 0, y: -perfil.gravity, z: 0 });
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.collider = this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(mesh.positions, mesh.indices),
      body
    );
    this.controller = this.world.createCharacterController(perfil.skin);
    this.controller.setMaxSlopeClimbAngle((perfil.maxSlopeDeg * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((perfil.maxSlopeDeg * Math.PI) / 180);
    this.controller.enableAutostep(perfil.stepHeight, perfil.radius * 0.5, true);
    this.controller.enableSnapToGround(perfil.snapToGround);
    this.controller.setApplyImpulsesToDynamicBodies(false);
  }

  free() {
    this.world.free();
  }
}

export class Player {
  /**
   * @param {World} world
   * @param {[number, number, number]} feet posicion de los pies, en metros
   */
  constructor(world, feet, { perfil = null } = {}) {
    this.world = world;
    this.perfil = perfil ?? world.perfil ?? PLAYER;
    const P = this.perfil;
    // La capsula se describe por la mitad de su parte recta y su radio; el
    // centro queda a media altura, no en los pies.
    const half = Math.max(P.height / 2 - P.radius, 0.01);
    this.half = half;
    this.centreOffset = half + P.radius;
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      feet[0],
      feet[1] + this.centreOffset,
      feet[2]
    );
    this.body = world.world.createRigidBody(desc);
    this.collider = world.world.createCollider(
      RAPIER.ColliderDesc.capsule(half, P.radius),
      this.body
    );
    this.velocityY = 0;
    this.grounded = false;
    this.yaw = 0;   // radianes, 0 mira hacia -Z
    this.pitch = 0;
    // --- lo que solo usa el camino de Master Sword ---
    /** La velocidad, EN UNIDADES POR SEGUNDO, como el motor. */
    this.vel = [0, 0, 0];
    /** La velocidad de caida mas alta desde que se despego del suelo. */
    this.caida = 0;
    /** La del ultimo aterrizaje, para poder cobrar el dano una sola vez. */
    this.ultimaCaida = 0;
    /** Lo que anda este personaje, en unidades. Lo pone quien lo sepa. */
    this.maxima = P.walkSpeed * (P.unidadesPorMetro ?? 32);
  }

  /** Posicion de los pies, en metros. */
  get feet() {
    const t = this.body.translation();
    return [t.x, t.y - this.centreOffset, t.z];
  }

  /** Posicion de los ojos, en metros. */
  get eye() {
    const f = this.feet;
    return [f[0], f[1] + this.perfil.eye, f[2]];
  }

  /** La rapidez horizontal, en unidades por segundo. */
  get rapidez() { return Math.hypot(this.vel[0], this.vel[2]); }

  /**
   * Pone el cuerpo donde se le diga, de golpe.
   *
   * Existe por la RECONCILIACION del experimento 27: cuando el servidor dice
   * que estabas en otro sitio, manda el servidor, y desde ahi se vuelven a
   * correr las ordenes que el todavia no habia visto.
   *
   * Y hay que mover las DOS cosas. Un cuerpo cinematico de Rapier lleva su
   * posicion y ademas la posicion a la que va: cambiar solo la primera lo
   * devuelve a la anterior en el siguiente `world.step()`, y eso no se ve como
   * un error -se ve como que la correccion no sirve de nada-.
   */
  colocar(pies, { velocidad = null } = {}) {
    const p = { x: pies[0], y: pies[1] + this.centreOffset, z: pies[2] };
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    if (velocidad) this.vel = [...velocidad];
    return this.feet;
  }

  /**
   * Un paso de simulacion.
   *
   * @param {number} dt en segundos
   * @param {{forward: number, strafe: number, jump: boolean}} input
   *   forward y strafe van en [-1, 1]; son intencion, no velocidad.
   */
  step(dt, input = {}) {
    if (this.perfil.msr) return this.pasoMsr(dt, input);
    const forward = input.forward ?? 0;
    const strafe = input.strafe ?? 0;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Con yaw 0 se mira hacia -Z y el costado va hacia +X.
    let dx = -sin * forward + cos * strafe;
    let dz = -cos * forward - sin * strafe;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }

    if (this.grounded) {
      // Pegado al suelo, no a cero.
      //
      // Con velocidad vertical cero y movimiento solo horizontal, el
      // controlador no tiene contra que probar el contacto y pierde el suelo
      // en cuanto se cruza la junta entre dos brushes. El jugador no se cae
      // -se queda a un centimetro-, pero 'grounded' castanea, y con el se cae
      // todo lo que dependa de el: saltar, el sonido de pasos, la animacion.
      // Un empujoncito hacia abajo constante lo mantiene apoyado y ademas es
      // lo que hace que bajar un escalon sea bajarlo y no saltarlo.
      this.velocityY = input.jump ? PLAYER.jumpSpeed : -PLAYER.stick;
    } else {
      this.velocityY -= PLAYER.gravity * dt;
    }

    const move = {
      x: dx * PLAYER.walkSpeed * dt,
      y: this.velocityY * dt,
      z: dz * PLAYER.walkSpeed * dt,
    };

    const c = this.world.controller;
    c.computeColliderMovement(this.collider, move);
    const applied = c.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: t.x + applied.x,
      y: t.y + applied.y,
      z: t.z + applied.z,
    });
    this.world.world.step();

    this.grounded = c.computedGrounded();
    if (this.grounded && this.velocityY < 0) this.velocityY = 0;

    return {
      applied: [applied.x, applied.y, applied.z],
      requested: [move.x, move.y, move.z],
      grounded: this.grounded,
    };
  }

  /**
   * Un paso con el modelo de Master Sword.
   *
   * La velocidad la lleva `src/play/movimiento.js`, en unidades y segundos,
   * traducido del motor. Lo unico que pasa aqui es la conversion a metros y el
   * empujon contra Rapier, que es quien resuelve el choque.
   *
   * **La division del trabajo, dicha en voz alta**: la VELOCIDAD es del motor
   * y el CHOQUE es de Rapier. `PM_FlyMove` y el controlador de personaje
   * resuelven el mismo problema —desplazar y deslizar contra la geometria, con
   * escalon— y reimplementarlo seria reescribir un motor de colision que ya
   * tenemos. La velocidad no: ahi Rapier no opina, y ahi estaba el fallo.
   *
   * `input.maxima` es lo que anda ESTE personaje, en unidades por segundo:
   * sale de su agilidad y de lo que cargue (`velocidadAndando`). Si no viene,
   * se usa la del perfil, que es la de alguien sin nada.
   */
  pasoMsr(dt, input = {}) {
    const P = this.perfil;
    const U = P.unidadesPorMetro;
    const maxima = input.maxima ?? this.maxima;
    const quiereSaltar = Boolean(input.jump) && this.grounded;

    // EN QUÉ MEDIO ESTÁS, que es lo que decide qué modelo corre.
    //
    // El orden es el del motor: la escalera gana al agua y el agua a la tierra
    // (`PM_PlayerMove` mira el ladder ANTES que el waterlevel). Una escalera
    // dentro de una charca se sube, no se nada.
    const intencion = { adelante: input.forward ?? 0, lado: input.strafe ?? 0 };
    const enEscalera = Array.isArray(input.escalera);
    const nivelAgua = input.agua ?? 0;
    let r;
    if (enEscalera) {
      r = trepar(this.vel, {
        intencion, yaw: this.yaw, cabeceo: this.pitch,
        normal: input.escalera, dt,
        saltar: Boolean(input.jump), enSuelo: this.grounded,
      });
    } else if (nivelAgua >= NADANDO) {
      r = nadar(this.vel, {
        intencion, yaw: this.yaw, maxima, dt, tope: input.tope ?? Infinity,
        // `upmove`: saltar sube y agacharse baja, que es como se nada en
        // GoldSrc. No hay tecla de «nadar arriba»: es la de saltar.
        subir: (input.jump ? 1 : 0) - (input.agachar ? 1 : 0),
      });
    } else {
      r = pasoDeVelocidad(this.vel, {
        intencion,
        yaw: this.yaw,
        maxima,
        // EL 97: el `pmove->maxspeed` que baja un efecto (src/play/trabas.js).
        tope: input.tope ?? Infinity,
        dt,
        enSuelo: this.grounded,
        alBorde: Boolean(input.alBorde),
        saltar: quiereSaltar,
      });
    }
    this.vel = r.velocidad;
    this.enEscalera = enEscalera;
    this.nivelAgua = nivelAgua;

    // Pegado al suelo, no a cero. Es el mismo apano que el camino de arriba y
    // la razon no ha cambiado: con desplazamiento vertical cero el controlador
    // no tiene contra que probar el contacto y pierde el suelo al cruzar la
    // junta entre dos brushes. El jugador no se cae -se queda a un centimetro-
    // pero `grounded` castanea, y con el se cae todo lo que dependa de el.
    //
    // Va DESPUES del modelo y no dentro: es nuestro, no del motor, y meterlo
    // en `movimiento.js` seria colar un apano entre las cifras leidas.
    const mover = [...r.mover];
    // El empujón hacia el suelo, SÓLO andando. Nadando o trepando pegaría al
    // jugador al fondo de la charca y al pie de la escalera.
    if (this.grounded && !quiereSaltar && !enEscalera && nivelAgua < NADANDO) {
      mover[1] = -P.stick * U * dt;
    }

    const move = { x: mover[0] / U, y: mover[1] / U, z: mover[2] / U };
    const c = this.world.controller;
    c.computeColliderMovement(this.collider, move);
    const applied = c.computedMovement();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: t.x + applied.x, y: t.y + applied.y, z: t.z + applied.z,
    });
    this.world.world.step();

    const antes = this.grounded;
    this.grounded = c.computedGrounded();

    // EL 99: LA VELOCIDAD SE RECORTA CONTRA LOS PLANOS QUE SE HAN TOCADO.
    //
    // Aquí había una regla nuestra: «si al subir se ha avanzado menos de la
    // mitad de lo pedido, la vertical a cero». No está en el motor, y se
    // equivocaba por los dos lados: un techo tocado al 60 % del paso dejaba la
    // velocidad entera (un fotograma pegado), y un techo INCLINADO, que en el
    // motor te desliza de lado, te paraba en seco. Lo del motor es
    // `PM_FlyMove` recortando con `PM_ClipVelocity` contra cada plano
    // (pm_shared.cpp:1021-1206): ver `velocidadContraPlanos` en movimiento.js.
    //
    // SÓLO EN EL AIRE (`!antes` es `onground == -1` al empezar el paso, que es
    // la rama :1128-1144). En el suelo el motor también recorta —`PM_WalkMove`
    // llama a `PM_FlyMove`, :1355 y :1380— y eso NO está portado: tocaría la
    // velocidad horizontal contra cada pared y cada rampa, y es otro
    // experimento. Ver doc/SALTO_99.md.
    //
    // VA ANTES DE LA CAÍDA, como en el motor: `flFallVelocity` se toma de la
    // velocidad con que EMPIEZA el paso (:3201), que es la ya recortada del
    // anterior; y el «en el suelo, sin velocidad hacia abajo» de :3384-3388
    // va después del recorte, que es donde está el `if` de abajo.
    //
    // Y EL ORDEN DE LA GRAVEDAD: el motor recorta ENTRE las dos medias
    // gravedades (`PM_AddCorrectGravity`, mover, `PM_FixupGravityVelocity`,
    // :3282, :3364, :3381), y `pasoDeVelocidad` devuelve la velocidad con las
    // dos ya puestas. Se quita la segunda, se recorta y se vuelve a poner.
    //
    // EL 99 (CORRECCIÓN, MISMO EXPERIMENTO): EL PARPADEO DEL ESCALÓN. Subiendo
    // un escalón, el autostep de Rapier deja la cápsula un paso o dos encima
    // del canto redondo y `computedGrounded()` dice «en el aire» sin que nadie
    // haya saltado ni caído. El motor no pasa nunca por ahí: con
    // `onground != -1` es `PM_WalkMove` quien sube el escalón
    // (pm_shared.cpp:1351-1390: prueba el paso subido 18 u y se queda con el
    // que llega más lejos), y subido ya no toca la contrahuella. Con el recorte en ese paso, la
    // contrahuella (−1, 0,04, 0) le quitaba la velocidad entera y Beto se
    // quedaba en x = 17,24 de Edana para siempre (sonda red95).
    //
    // LA GUARDA ES NUESTRA, y se lee de lo que devuelve Rapier: si el paso NO
    // pedía subir (`mover[1] <= 0`) y la cápsula ha SUBIDO, eso es el
    // autostep, o sea el escalón de `PM_WalkMove`, que es del suelo y no del
    // aire. Un salto pide subir (no entra aquí) y una caída no sube. Medido en
    // Edana: el parpadeo dura uno o dos pasos y en los dos sube 0,028-0,030 m
    // pidiendo −0,003/−0,008. Una primera versión miraba «vertical 0 justo
    // tras un paso en el suelo» y sólo cubría el primero de los dos: Beto
    // pasaba, pero medio segundo más tarde que con la regla vieja.
    const escalon = mover[1] <= 0 && applied.y > 0;
    if (!antes && !escalon) {
      const choques = [];
      for (let i = 0; i < c.numComputedCollisions(); i++) {
        const k = c.computedCollision(i);
        if (k) choques.push({ n: [k.normal1.x, k.normal1.y, k.normal1.z], toi: k.toi });
      }
      if (choques.length) {
        const andando = !enEscalera && nivelAgua < NADANDO;
        const media = andando ? (MOVEVARS.gravedad * dt) / 2 : 0;
        const v = [this.vel[0], this.vel[1] + media, this.vel[2]];
        const recortada = velocidadContraPlanos(v, choques, {
          reflejar: !enEscalera,
          seMovio: Math.hypot(applied.x, applied.y, applied.z) > 1e-6,
        });
        recortada[1] -= media;
        this.vel = recortada;
      }
    }

    // LA CAIDA. El motor guarda `flFallVelocity` mientras estas en el aire y la
    // cobra al tocar suelo (`PM_CatagorizePosition`). Aqui igual: se lleva la
    // mayor velocidad de bajada y se entrega en el fotograma del aterrizaje.
    this.ultimaCaida = 0;
    // EL AGUA BORRA LA CAÍDA, y es del motor: `PM_CheckFalling` empieza con
    // `if (pmove->onground != -1 && !pmove->waterlevel && flFallVelocity)`. O
    // sea que tocar agua —nivel 1, con los tobillos— cancela el daño de la
    // caída entera. Sin esto, tirarse a la charca desde la muralla mata, que
    // es justo lo contrario de para lo que sirve una charca.
    if (nivelAgua > 0 || enEscalera) this.caida = 0;
    if (!this.grounded) {
      this.caida = Math.max(this.caida, -this.vel[1]);
    } else {
      if (!antes && this.caida > 0) this.ultimaCaida = this.caida;
      this.caida = 0;
      // Al tocar suelo la velocidad vertical se pierde, que es lo que impide
      // acumular caida entre fotogramas apoyado en el suelo.
      if (this.vel[1] < 0) this.vel[1] = 0;
    }

    return {
      applied: [applied.x, applied.y, applied.z],
      requested: [move.x, move.y, move.z],
      grounded: this.grounded,
      /** En unidades por segundo, como el motor. */
      velocidad: [...this.vel],
      rapidez: this.rapidez,
      /** Velocidad del aterrizaje de este fotograma, o 0. */
      caida: this.ultimaCaida,
      /** Y lo que costaria en vida, que lo decide quien tenga el personaje. */
      danoDeCaida: danoDeCaida(this.ultimaCaida),
    };
  }
}
