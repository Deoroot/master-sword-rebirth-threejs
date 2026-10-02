// DÓNDE ESTÁS: el agua, las escaleras, el plano de la muerte y las zonas.
//
// Hasta ahora el mapa era geometría. Todo lo que no fuera una pared no era
// nada: los 451 m² de agua se dibujaban y se atravesaban, las dos escaleras no
// existían, y el `trigger_hurt` del fondo —con 999 999 de daño— tampoco.
//
// Esto es `PM_PointContents` en pequeño. Y la primera versión estaba MAL: la
// escribí preguntando con la caja envolvente de cada volumen, con un comentario
// que decía que los brushes de Gate City eran rectangulares. **El estanque
// grande no lo es** — sus caras tienen normales como (−0,65, −0,76, 0), es un
// contorno irregular de 19,7 × 8,9 m. Medido al hornear: con la envolvente, el
// **36 %** del peor volumen habría sido agua donde no hay agua. O sea nadar en
// la orilla, que nadie habría achacado a esto.
//
// Así que se pregunta con los PLANOS del brush, que es lo que hace el motor. Un
// brush de GoldSrc es convexo por construcción —se comprueba al hornear, no se
// supone— así que dentro es estar detrás de todos sus planos. La caja se
// conserva como filtro barato: si no estás en ella, no hace falta mirar más.
//
// Los dos volúmenes SIN planos son las escaleras y el `trigger_hurt`: son
// invisibles y el compilador se comió sus caras, así que no hay planos que leer
// y manda la caja — que para un brush sin caras es lo que el motor usa de casco.
//
// Todo viene de `malla.json` en coordenadas de escena y en METROS, que es lo
// que usa el visor. Las alturas del jugador que se le preguntan van en unidades
// de GoldSrc, porque el modelo de `movimiento.js` trabaja así.

import { nivelDeAgua, normalDeEscalera } from "./movimiento.js";

/** ¿Está el punto dentro de la caja? Bordes incluidos. */
export function dentro(caja, p) {
  return p[0] >= caja.min[0] && p[0] <= caja.max[0] &&
         p[1] >= caja.min[1] && p[1] <= caja.max[1] &&
         p[2] >= caja.min[2] && p[2] <= caja.max[2];
}

/**
 * ¿Está el punto dentro del volumen? La caja primero y las piezas después.
 *
 * El `margen` es cero a propósito: un volumen de agua con margen te moja antes
 * de tocarla. Existe para las escaleras, donde el jugador está pegado por fuera.
 *
 * **`piezas` es del 48**, y son varias porque una entidad puede tener varios
 * brushes: dentro es estar dentro de ALGUNA. Hasta entonces había una sola
 * lista de planos, sacada de las caras del modelo, y los volúmenes sin caras
 * —las escaleras, los `trigger_hurt`, las `msarea_*`— se contestaban con la
 * envolvente. El `trigger_hurt` de Gate City son cinco brushes separados.
 */
export function dentroDe(v, p, margen = 0) {
  if (margen) {
    const holgada = {
      min: v.caja.min.map((x) => x - margen),
      max: v.caja.max.map((x) => x + margen),
    };
    if (!dentro(holgada, p)) return false;
  } else if (!dentro(v.caja, p)) {
    return false;
  }
  const enPieza = (ps) => ps.every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] - q.d <= margen);
  if (v.piezas?.length) return v.piezas.some(enPieza);
  if (v.planos) return enPieza(v.planos);
  return true;                     // ni piezas ni planos: manda la caja
}

/**
 * Los volúmenes de un mapa, listos para preguntarles.
 *
 * `interactivas` es lo que escribe `tools/gatecity.mjs` en `malla.json`.
 */
export class Volumenes {
  constructor(interactivas = {}, { unidadesPorMetro = 39.37 } = {}) {
    this.U = unidadesPorMetro;
    this.agua = interactivas.agua ?? [];
    this.escaleras = interactivas.escaleras ?? [];
    this.dano = interactivas.dano ?? [];
    this.zonas = interactivas.zonas ?? [];
  }

  /**
   * El nivel de agua de quien tiene los pies ahí: 0, 1, 2 o 3.
   *
   * `pies` va en metros y en coordenadas de escena. Las tres alturas que mira
   * son las del motor y las decide `nivelDeAgua`; aquí sólo se le contesta si
   * a tal altura hay agua.
   */
  nivelDeAguaEn(pies, { agachado = false } = {}) {
    if (!this.agua.length) return 0;
    const hayAgua = (u) => {
      const p = [pies[0], pies[1] + u / this.U, pies[2]];
      return this.agua.some((a) => dentroDe(a, p));
    };
    return nivelDeAgua(hayAgua, { agachado });
  }

  /**
   * La normal de la escalera que te toca, o `null`.
   *
   * Se mira a la altura del PECHO y no de los pies: una escalera empieza por
   * encima del suelo y con el punto en la planta se suelta en el primer
   * peldaño. El motor hace una traza contra el modelo con la caja entera; con
   * un punto, el pecho es donde esa caja y la escalera se solapan siempre.
   *
   * El `margen` existe porque la caja de la escalera es FINA —cinco unidades—
   * y el jugador nunca está dentro: está pegado por fuera. Media caja de
   * jugador, 16 unidades, es lo que el motor recorre con su traza.
   */
  escaleraEn(pies, { altura = 36, margen = 16 } = {}) {
    if (!this.escaleras.length) return null;
    const m = margen / this.U;
    const p = [pies[0], pies[1] + altura / this.U, pies[2]];
    for (const e of this.escaleras) {
      // El margen sólo en horizontal: en vertical, una escalera acaba donde
      // acaba, y alargarla te dejaría trepando un metro por encima del borde.
      const holgada = {
        min: [e.caja.min[0] - m, e.caja.min[1], e.caja.min[2] - m],
        max: [e.caja.max[0] + m, e.caja.max[1], e.caja.max[2] + m],
      };
      if (dentro(holgada, p)) return normalDeEscalera(e.caja, p);
    }
    return null;
  }

  /**
   * El daño por segundo de los `trigger_hurt` que te tocan.
   *
   * Gate City tiene UNO, con `dmg 999999`: una losa de 2 864 × 705 × 16
   * unidades —72 × 18 × 0,4 m— a la altura z = −496.
   *
   * Y digo lo que NO es, porque lo escribí mal primero: **no es el fondo del
   * mundo.** El mapa va de z = −920 a 348, así que esto está en la parte baja
   * pero a 424 unidades del suelo real, y cubre una zona concreta y no el mapa
   * entero. Lo que es con seguridad es muerte instantánea al tocarlo; qué hay
   * encima no lo he mirado, y no hace falta para respetarlo.
   */
  danoEn(pies) {
    let total = 0;
    for (const d of this.dano) if (dentroDe(d, pies)) total += d.dano ?? 0;
    return total;
  }

  /** Las zonas que te contienen, con su clase. Para la música y las salidas. */
  zonasEn(pies) {
    return this.zonas.filter((z) => dentroDe(z, pies));
  }
}
