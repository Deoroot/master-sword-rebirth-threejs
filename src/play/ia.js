// LA CAZA: `npcatk_hunt`, de `monsters/base_npc_attack_new.script`.
//
// Hasta ahora los 69 bichos de Gate City paseaban: treinta líneas que andan y
// giran al chocar. Esto es el bucle de decisión del mod — ver, perseguir,
// golpear— y **es sólo la decisión**: aquí no hay Three, ni Rapier, ni
// posiciones que se muevan. Devuelve una intención y quien la ejecuta es
// `src/render/bichos.js`. Por eso se prueba en `node --test`.
//
// Lo que NO está y conviene decirlo: huir, encogerse al recibir un golpe,
// buscar a ciegas más de un rebote, los aliados que se avisan, el nodo de
// navegación. Son otros 1 200 de los 1 390 del script.
//
// ── Las cinco cosas que no se adivinan ─────────────────────────────────────
//
// 1. **Quién es enemigo no lo dice el monstruo: lo dice la tabla de razas.**
//    Está en `src/bsp/script.js`. De los 69 de Gate City son hostiles 33.
//
// 2. **Hay DOS relojes**, y se diferencian en veinte veces: 2 s parado y 0,1 s
//    en combate. Con uno solo, o gasta mucho o reacciona tarde — y si se deja
//    el de combate siempre, 69 bichos piensan 690 veces por segundo.
//
// 3. **Tres alcances distintos y no uno**: `MOVE_RANGE` (a qué distancia deja
//    de acercarse), `ATTACK_RANGE` (a cuál blande) y `ATTACK_HITRANGE` (a cuál
//    hace daño). Para el goblin son 90, 130 y 130. Colapsarlos en uno hace que
//    se pegue al jugador antes de pegarle, o que pegue desde lejos.
//
// 4. **Al perder de vista no se queda quieto**: va a la última posición
//    conocida, y al llegar se inventa un punto a 128 unidades del objetivo
//    real en una dirección al azar. Es «buscar», y sin eso un monstruo al que
//    esquivas se queda plantado mirando una esquina.
//
// 5. **Si ve a otro enemigo MÁS CERCA que su objetivo, cambia** — pero sólo si
//    es un jugador y sólo si `CAN_RETALIATE`.

// De `razas.js` y NO de `script.js`: ése lee ficheros con `node:fs`, y
// tocarlo desde el navegador hace que Vite lo externalice y la página no
// cargue — sin más error que uno en la consola antes de que exista `probe`.
import { RELACION, esEnemigo, relacionDeRazas, RAZA_DEL_JUGADOR } from "../bsp/razas.js";

export { RELACION, esEnemigo, relacionDeRazas, RAZA_DEL_JUGADOR };

/** Los relojes de `base_npc_attack_new.script:93`. */
export const CICLO = { ocioso: 2.0, combate: 0.1, npc: 0.8 };

/** Hasta dónde persigue, en unidades (`npcatk_post_load`). */
export const ALCANCE_DE_PERSECUCION = 4000;

/** Lo que se aleja el punto de búsqueda a ciegas, en unidades. */
export const SALTO_A_CIEGAS = 128;

/** Lo que el motor considera «he llegado»: `m_Width * 1.1` (msmonster.h:355). */
export const cercaniaDe = (ancho) => ancho * 1.1;

/** Qué quiere hacer un bicho este ciclo. */
export const ACCION = {
  NADA: "nada", PASEAR: "pasear", PERSEGUIR: "perseguir", BUSCAR: "buscar", GOLPEAR: "golpear",
  /** `npcatk_flee`: correr en direccion contraria durante FLEE_TIME. */
  HUIR: "huir",
};

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * El cazador de un bicho. Uno por instancia.
 *
 * `ficha` es la `ia` que extrae `src/bsp/script.js` del `.script`, en
 * UNIDADES de GoldSrc — no en metros. Quien lo llame convierte.
 */
export class Cazador {
  constructor(ficha, { azar = Math.random, alcanceDePersecucion = ALCANCE_DE_PERSECUCION } = {}) {
    this.f = ficha;
    this.azar = azar;
    this.alcanceDePersecucion = alcanceDePersecucion;
    /** A quién persigue, o `null`. */
    this.objetivo = null;
    /** Dónde lo vio por última vez. */
    this.ultimoSitio = null;
    /** Si lo veía el ciclo pasado, para no repetir el evento de «lo perdí». */
    this.loVeia = false;
    /** Cuánto falta para el siguiente pensamiento. */
    this.reloj = 0;
    /** Cuánto falta para poder volver a golpear. */
    this.recarga = 0;
    /** La huida: `{ de, queda, distancia }` o `null`. Ver `npcatk_flee`. */
    this.fuga = null;
  }

  /**
   * `npcatk_settarget`, que es lo que hace un aliado avisado. No comprueba
   * relación ni distancia: eso lo hizo quien avisa (`aQuienAvisa`).
   */
  apuntarA(id) {
    if (this.objetivo === id) return false;
    this.objetivo = id;
    this.ultimoSitio = null;
    this.loVeia = false;
    // Y pensar YA. Sin esto el avisado tarda hasta dos segundos en arrancar,
    // porque venía del reloj ocioso.
    this.reloj = 0;
    return true;
  }

  /**
   * `npcatk_flee <objetivo> <distancia> <tiempo>`: dejar el ataque y correr.
   * El motor guarda el objetivo (`npcatk_store_target`) y lo recupera al parar.
   */
  huyeDe(id, { distancia = 1000, tiempo = 10 } = {}) {
    if (this.fuga) return false;
    this.fuga = { de: id, queda: tiempo, distancia, objetivoGuardado: this.objetivo };
    this.reloj = 0;
    return true;
  }

  get huyendo() { return Boolean(this.fuga); }

  /** El reloj que le toca: en cuanto tiene objetivo, piensa veinte veces más. */
  get ciclo() { return this.objetivo ? CICLO.combate : CICLO.ocioso; }

  /**
   * Un ciclo de `npcatk_hunt`.
   *
   * @param dt       segundos
   * @param mundo    { donde, candidatos, veA }
   *   `donde`      dónde estoy, en unidades
   *   `candidatos` [{ id, donde, esJugador, relacion }]
   *   `veA(id)`    si hay línea de visión, que la pone quien tenga la física
   * @returns `null` si no toca pensar, o `{ accion, ... }`
   */
  tic(dt, mundo) {
    if (this.recarga > 0) this.recarga = Math.max(0, this.recarga - dt);
    // El reloj de la huida corre en tiempo real y no por ciclos: son diez
    // segundos de reloj de pared, y el ciclo de pensar no siempre es el mismo.
    if (this.fuga) this.fuga.queda -= dt;
    this.reloj -= dt;
    if (this.reloj > 0) return null;
    this.reloj = this.ciclo;

    const { donde, candidatos = [], veA = () => true } = mundo;
    const de = (id) => candidatos.find((c) => c.id === id) ?? null;

    // 0. HUIR manda sobre todo lo demás: `npcatk_hunt` no corre mientras
    //    `IS_FLEEING`, y el ataque se corta con `playanim break`.
    if (this.fuga) {
      if (this.fuga.queda <= 0) {
        // Al parar se recupera el objetivo guardado, que es lo que hace
        // `npcatk_stopflee` con `NPCATK_FLEE_RESTORETARGET`.
        this.objetivo = this.fuga.objetivoGuardado ?? this.objetivo;
        this.fuga = null;
      } else {
        const o = de(this.fuga.de);
        // Sin nadie de quien huir se sigue corriendo en el último rumbo: quien
        // mueve ya tiene destino. Devolver NADA aquí pararía la huida en seco.
        if (!o) return { accion: ACCION.HUIR, destino: null, rango: null };
        const dx = donde[0] - o.donde[0], dz = donde[2] - o.donde[2];
        const l = Math.hypot(dx, dz) || 1;
        return {
          accion: ACCION.HUIR,
          objetivo: this.fuga.de,
          // `setmovedest FLEE_TARGET FLEE_DISTANCE flee`: el destino está a
          // FLEE_DISTANCE en la dirección contraria, y la cara al revés
          //  —`MY_YAW + 180`— para que corra de frente y no de espaldas.
          destino: [
            donde[0] + (dx / l) * this.fuga.distancia,
            donde[1],
            donde[2] + (dz / l) * this.fuga.distancia,
          ],
          cerca: 1,
          rango: dist(donde, o.donde),
        };
      }
    }

    // 1. SIN OBJETIVO: si veo a un enemigo, lo tomo.
    if (this.objetivo === null) {
      const visto = candidatos.find((c) => esEnemigo(c.relacion) && veA(c.id));
      if (!visto) return { accion: this.f.pasea ? ACCION.PASEAR : ACCION.NADA };
      this.objetivo = visto.id;
      this.ultimoSitio = null;
    }

    // 2. VALIDAR: si ya no existe o se ha ido muy lejos, se olvida.
    const o = de(this.objetivo);
    if (!o) { this.olvidar(); return { accion: this.f.pasea ? ACCION.PASEAR : ACCION.NADA }; }
    if (dist(donde, o.donde) > this.alcanceDePersecucion) {
      this.olvidar();
      return { accion: this.f.pasea ? ACCION.PASEAR : ACCION.NADA, porQue: "fuera_de_alcance" };
    }

    // 3. ¿LO VEO?
    const loVeo = veA(o.id);
    let destino;
    let cerca;
    if (loVeo) {
      this.loVeia = true;
      this.ultimoSitio = [...o.donde];
      destino = [...o.donde];
      cerca = this.f.alcanceParaPararse;
      // Si veo a un enemigo MÁS CERCA y es un jugador, me lo quedo.
      if (this.f.puedeCambiarDeObjetivo !== false) {
        const mejor = candidatos.find((c) =>
          c.id !== o.id && c.esJugador && esEnemigo(c.relacion) && veA(c.id) &&
          dist(donde, c.donde) < dist(donde, o.donde));
        if (mejor) { this.objetivo = mejor.id; this.ultimoSitio = [...mejor.donde]; }
      }
    } else {
      const acabaDePerderlo = this.loVeia;
      this.loVeia = false;
      if (this.ultimoSitio === null) {
        destino = [...o.donde];
        cerca = this.f.alcanceParaPararse;
      } else {
        destino = [...this.ultimoSitio];
        cerca = 1;
        // Al llegar al último sitio conocido, se inventa uno nuevo: la
        // posición REAL del objetivo más 128 unidades en un rumbo al azar.
        // El doble de la cercanía es del script (`NPC_DBL_MOVEPROX`).
        const dobleCercania = 2 * (this.f.cercaniaDeDestino ?? cercaniaDe(this.f.ancho ?? 32));
        if (dist(donde, this.ultimoSitio) <= dobleCercania) {
          const a = this.azar() * Math.PI * 2;
          this.ultimoSitio = [
            o.donde[0] + Math.cos(a) * SALTO_A_CIEGAS,
            o.donde[1],
            o.donde[2] + Math.sin(a) * SALTO_A_CIEGAS,
          ];
          destino = [...this.ultimoSitio];
        }
      }
      if (acabaDePerderlo) this.perdido = true;
    }

    // 4. ¿LE PEGO? Se mide contra `ATTACK_HITRANGE` primero y contra
    //    `ATTACK_RANGE` después, que es el orden del script — y no son el
    //    mismo número en general.
    const rango = dist(donde, o.donde);
    if (rango < (this.f.alcanceDeImpacto ?? 0)) {
      // `NPC_MUST_SEE_TARGET`: con 0 puede pegar sin línea de visión, que es
      // lo que hace el goblin. Con 1, no.
      const puede = this.f.tieneQueVerte === false || loVeo;
      if (puede && rango < (this.f.alcanceDeGolpe ?? 0) && this.recarga <= 0) {
        return { accion: ACCION.GOLPEAR, objetivo: o.id, rango, destino };
      }
    }

    return {
      accion: loVeo ? ACCION.PERSEGUIR : ACCION.BUSCAR,
      objetivo: o.id, destino, cerca, rango,
    };
  }

  /** Se ha golpeado: arranca la espera hasta el siguiente. */
  haGolpeado(segundos) { this.recarga = segundos; }

  olvidar() { this.objetivo = null; this.ultimoSitio = null; this.loVeia = false; }
}

/**
 * ¿Acierta el golpe? `ATTACK_HITCHANCE 60%` del goblin.
 *
 * Se separa porque es la parte con azar, y una prueba que no pueda fijar el
 * dado no puede comprobar el daño.
 */
export function acierta(ficha, azar = Math.random) {
  const p = ficha.aciertos?.min ?? 100;
  return azar() * 100 < p;
}

/** El daño de un golpe: `ATTACK_DAMAGE $randf(6,9)`. */
export function danoDe(ficha, azar = Math.random) {
  const d = ficha.dano;
  if (!d) return 0;
  return d.min + azar() * (d.max - d.min);
}
