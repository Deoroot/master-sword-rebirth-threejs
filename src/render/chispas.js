// LA LLUVIA DE COLORES DE SUBIR DE NIVEL, dibujada.
//
// La regla —cada cuánto, cuántas, dónde nacen, a qué velocidad y con qué
// gravedad— está en `src/play/nivel.js` y se prueba sin navegador. Esto es lo
// que se ve: 160 carteles aditivos en cuatro segundos y una luz que cambia de
// color diez veces por segundo.
//
// ── Por qué un conjunto fijo y no un sprite por chispa ─────────────────────
//
// Por lo mismo que las flechas: 160 `new THREE.Sprite()` en cuatro segundos son
// 160 materiales y 160 entradas en el grafo, y el navegador lo nota. Se montan
// las 160 al arrancar el efecto —que es el número exacto que el guion crea, no
// una estimación— y se reparten. El original no recicla nada porque en GoldSrc
// los tempents viven en un array fijo de 500 que ya estaba reservado
// (`entity.cpp`, `gEngfuncs.pEfxAPI->CL_TentEntAllocCustom`); aquí el array fijo
// lo hacemos nosotros y el efecto es el mismo.
//
// ── De dónde sale el dibujo, que tiene dos caminos ─────────────────────────
//
// `xflare1.spr` **no está en `../MSC/`**: es del Half-Life base, como un tercio
// de los sonidos. `npm run efectos` lo hornea desde `valve/` si hay Half-Life al
// lado —y medido son **20 cuadros de 64×64 en aditivo**, que es exactamente lo
// que le pide el guion con su `frames 20`— y si no, genera la bengala nuestra de
// `src/bsp/halo.js`, que tiene UN cuadro. En ese segundo caso la bengala no
// palpita, y `estado()` lo dice con `generado: true` para que ninguna medida
// pueda pasar por buena sin saberlo.

import * as THREE from "three";
import { bengala } from "../bsp/halo.js";
import { EFECTO, CHISPA, CL_GRAVITY, chispasDeUnaVuelta, vueltas } from "../play/nivel.js";

import { BASE_COMUN } from "../play/recursos.js";
import { traerJson } from "../play/json.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/**
 * Pide el catálogo de `npm run efectos`. Sin él —o sin el `.png`— se sigue con
 * la bengala generada: quedarse sin efecto porque falta un horneado sería
 * perder justo lo que se ha venido a ver.
 */
export async function cargarBengala({ base = BASE_POR_DEFECTO } = {}) {
  try {
    const c = await traerJson(`${base}/efectos.json`);
    const f = c?.sprites?.["xflare1.spr"];
    if (!f) return null;
    const tex = await new THREE.TextureLoader().loadAsync(`${base}/${f.archivo}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return { tex, cuadros: f.cuadros, generado: Boolean(f.generado), de: f.de ?? "?" };
  } catch {
    return null;
  }
}

/** La bengala nuestra, en memoria: el respaldo y lo que usan las pruebas. */
export function bengalaGenerada() {
  const b = bengala(64);
  const t = new THREE.DataTexture(b.rgba, b.ancho, b.alto, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return { tex: t, cuadros: 1, generado: true, de: "nuestro" };
}

/**
 * Monta el emisor.
 *
 * `U` son las unidades por metro: todo lo del guion está en unidades de GoldSrc
 * y el mundo está en metros, así que la conversión pasa por aquí y por un solo
 * sitio.
 *
 * `luz` es opcional y es la `cleffect light`: un `PointLight` que el guion
 * enciende verde y luego repinta de un color al azar en cada vuelta. Se puede
 * dejar fuera —hay quien juega con la luz dinámica apagada— y el resto sigue.
 */
export function montarChispas({ U = 39.37, conLuz = true, azar = Math.random, bengala: B = null } = {}) {
  const grupo = new THREE.Group();
  grupo.name = "chispas";
  grupo.visible = false;

  const fuente = B ?? bengalaGenerada();
  const total = vueltas() * EFECTO.porVuelta;      // 40 × 4 = 160

  /**
   * Las 160, todas muertas al empezar, cada una con SU textura.
   *
   * La textura se clona por chispa porque la tira son los 20 cuadros pegados en
   * horizontal y el cuadro se elige moviendo el `offset`: con una textura
   * compartida las 160 irían por el mismo cuadro, y arrancando en instantes
   * distintos eso se ve — todas palpitarían al unísono en vez de cada una por
   * su cuenta. Clonar una textura no copia la imagen, sólo la envoltura.
   */
  const piezas = [];
  for (let i = 0; i < total; i++) {
    const tex = fuente.tex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1 / fuente.cuadros, 1);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }));
    s.visible = false;
    grupo.add(s);
    piezas.push({ nodo: s, viva: false, t: 0, vel: [0, 0, 0], cuadro: 0 });
  }

  let luz = null;
  if (conLuz) {
    // EL RADIO ES DEL GUION; LA INTENSIDAD ES NUESTRA, y se dice.
    //
    // En GoldSrc una `dlight` no tiene intensidad: tiene radio, color y una
    // caída lineal hasta el radio. Three no tiene eso, así que hay que elegir
    // dos números —candela y `decay`— que no están en ninguna parte del juego.
    //
    // `decay: 1` y no 2, que es el mismo trato que ya tiene el glow del jugador
    // (`GLOW.decaimiento` en `src/render/bsp_escena.js`, con su barrido): la
    // caída cuadrática de Three es física y la de GoldSrc no, y con 2 una luz a
    // cinco metros quema todo lo que tiene a un metro. El primer intento iba con
    // 2 y la sonda salió con el suelo entero en blanco.
    //
    // Y la candela a 3, la mitad del glow, porque esta luz dura cuatro segundos
    // y el glow dura toda la partida: una que parpadea diez veces por segundo
    // llama mucho más la atención que una fija del mismo brillo.
    luz = new THREE.PointLight(0x00ff00, 3, EFECTO.luz.radio / U, 1);
    luz.visible = false;
    grupo.add(luz);
  }

  let t = 0;                 // desde que arrancó el efecto
  let corriendo = false;
  let proxima = 0;           // cuándo toca la siguiente vuelta
  let siguiente = 0;         // qué pieza repartir
  let centro = [0, 0, 0];    // el origen del jugador, en metros
  let vueltasDadas = 0;

  /**
   * Arranca. `origen` es el **origen del motor**, o sea el centro del jugador,
   * no los pies: el anillo nace 32 unidades por debajo de él.
   */
  function arrancar(origen) {
    centro = [...origen];
    t = 0; proxima = 0; siguiente = 0; vueltasDadas = 0;
    corriendo = true;
    grupo.visible = true;
    if (luz) {
      // `cleffect light new <origin> 200 (0,255,0) 3.0`: la primera es VERDE.
      luz.color.setRGB(0, 1, 0);
      luz.position.set(centro[0], centro[1], centro[2]);
      luz.visible = true;
    }
  }

  function parar() {
    corriendo = false;
    for (const p of piezas) { p.viva = false; p.nodo.visible = false; }
    if (luz) luz.visible = false;
    grupo.visible = false;
  }

  /** Mueve el centro: el cuerpo se cae mientras el efecto dura. */
  function seguir(origen) { centro = [...origen]; }

  function soltarVuelta() {
    const lote = chispasDeUnaVuelta({ azar });
    for (const c of lote) {
      const p = piezas[siguiente % piezas.length];
      siguiente++;
      p.viva = true; p.t = 0; p.cuadro = 0;
      p.nodo.material.map.offset.x = 0;
      p.nodo.visible = true;
      p.nodo.position.set(
        centro[0] + c.desplazamiento[0] / U,
        centro[1] + c.desplazamiento[1] / U,
        centro[2] + c.desplazamiento[2] / U,
      );
      // `velocity` en unidades por segundo → metros por segundo.
      p.vel = [c.velocidad[0] / U, c.velocidad[1] / U, c.velocidad[2] / U];
      // `scale 0.25` sobre un sprite de 64 px, y en GoldSrc 1 px = 1 unidad.
      const lado = (64 * CHISPA.escala) / U;
      p.nodo.scale.set(lado, lado, 1);
      p.nodo.material.color.setRGB(c.color[0] / 255, c.color[1] / 255, c.color[2] / 255);
      p.nodo.material.opacity = CHISPA.alfa / 255;
    }
    if (luz) {
      // Cada vuelta repinta la MISMA luz con un color al azar. Los tres
      // `$rand(0,255)` salen del mismo sitio que los de las chispas.
      luz.color.setRGB(azar(), azar(), azar());
      luz.position.set(centro[0], centro[1], centro[2]);
    }
    vueltasDadas++;
  }

  /**
   * Un paso.
   *
   * La gravedad: `baseline.origin[2] += -frametime · cl_gravity · gravity`
   * (`entity.cpp:1942,1951-1952,2301-2302`) con `gravity = -0,5`, o sea **+400
   * unidades por segundo al cuadrado hacia arriba**. Y la posición,
   * `origin[i] += baseline.origin[i] · frametime`.
   *
   * Se integra en el mismo orden que el motor —primero mover, después acelerar—
   * porque hacerlo al revés adelanta medio fotograma de gravedad y con una
   * aceleración de 400 eso se ve en el primer cuadro.
   */
  function paso(dt) {
    if (!corriendo || !(dt > 0)) return;
    const g = (-CL_GRAVITY * CHISPA.gravedad) / U;   // +400 u/s² → m/s²

    for (const p of piezas) {
      if (!p.viva) continue;
      p.nodo.position.x += p.vel[0] * dt;
      p.nodo.position.y += p.vel[1] * dt;
      p.nodo.position.z += p.vel[2] * dt;
      p.vel[1] += g * dt;
      p.t += dt;
      // `if (pTemp->flags & FTENT_SPRANIMATE) frame += frametime · framerate`, y
      // el bucle: `if (frame >= frameMax) frame -= (int)frame` (entity.cpp:2117-
      // 2125). Los sprites arrancan con `FTENT_SPRANIMATELOOP` puesto
      // (entity.cpp:958), así que los 20 cuadros a 30 por segundo dan la vuelta
      // y media dentro del segundo que vive la chispa.
      if (fuente.cuadros > 1) {
        p.cuadro += dt * CHISPA.porSegundo;
        if (p.cuadro >= CHISPA.cuadros) p.cuadro -= Math.trunc(p.cuadro);
        p.nodo.material.map.offset.x = Math.min(fuente.cuadros - 1, Math.floor(p.cuadro)) / fuente.cuadros;
      }
      // `death_delay 1.0`: se apaga y ya. El motor no la desvanece —no lleva
      // `FTENT_FADEOUT` ni `fadeout`—, desaparece de golpe.
      if (p.t >= CHISPA.vida) { p.viva = false; p.nodo.visible = false; }
    }

    t += dt;
    while (corriendo && t >= proxima && vueltasDadas < vueltas()) {
      soltarVuelta();
      proxima += EFECTO.periodo;
    }
    // `callevent 4.0 end_fx_levelup` borra el guion, y con él la luz. Las
    // chispas que ya estaban vivas siguen su segundo: el `removescript` no las
    // mata, son tempents del motor y ya no son del guion.
    if (t >= EFECTO.duracion && luz) luz.visible = false;
    if (t >= EFECTO.duracion + CHISPA.vida) parar();
  }

  return {
    grupo, arrancar, parar, seguir, paso,
    get corriendo() { return corriendo; },
    /** Lo que hay ahora mismo, para las sondas. */
    estado() {
      return {
        corriendo, t: Number(t.toFixed(3)), vueltas: vueltasDadas, total: piezas.length,
        vivas: piezas.filter((p) => p.viva).length,
        // De dónde salió el dibujo, y cuántos cuadros tiene de verdad: con la
        // bengala generada es 1 y la animación no existe.
        bengala: { cuadros: fuente.cuadros, generado: fuente.generado, de: fuente.de },
        luz: luz ? {
          encendida: luz.visible,
          color: [luz.color.r, luz.color.g, luz.color.b].map((v) => Math.round(v * 255)),
        } : null,
        // Los colores de las vivas, que es lo que hace que esto sea «un montón
        // de colores» y no un montón de puntos blancos.
        colores: piezas.filter((p) => p.viva)
          .map((p) => [p.nodo.material.color.r, p.nodo.material.color.g, p.nodo.material.color.b]
            .map((v) => Math.round(v * 255))),
        alturas: piezas.filter((p) => p.viva).map((p) => Number((p.nodo.position.y - centro[1]).toFixed(3))),
      };
    },
    destruir() {
      for (const p of piezas) { p.nodo.material.map?.dispose(); p.nodo.material.dispose(); }
      grupo.removeFromParent();
    },
  };
}
