// EL RECORRIDO DE LA CÁMARA DEL MENÚ. La parte que no dibuja.
//
// ── De dónde sale esto ──────────────────────────────────────────────────────
//
// El menú de Master Sword no tiene cámara: su fondo son **doce TGA de 256 px en
// mosaico** (`resource/BackgroundLayout.txt`, los junta `npm run menu`), porque
// GoldSrc no admitía texturas más grandes.
//
// CORRECCIÓN, mismo experimento 52, más tarde y de otra sesión. Aquí decía que
// un mapa de fondo vivo «es cosa de Source» y que por tanto «esto es nuestro, no
// se cita nada». **Era falso, y se deja escrito en vez de borrarlo**: los mapas
// de fondo son de Source Y DE XASH3D, o sea del motor sobre el que corre la
// build standalone de Master Sword. Con nombre propio y con su modo:
//
//     UI_StartBackGroundMap()      mainui/BaseMenu.cpp:547-581
//       elige uno al azar y manda `map_background`
//     SV_SpawnServer(..., background)  sv_init.c:1011, :1060
//       guarda `sv.background`, y lo publica en `sv_background`/`cl_background`
//
// Y el modo apaga exactamente lo que aquí se quería apagar:
//
//     sv_client.c:1422-1423   al jugador le ponen FL_GODMODE|FL_NOTARGET,
//                             con el comentario «don't attack player in
//                             background mode»
//     sv_main.c:111           `sv_background_freeze`, por omisión 1
//     sv_client.c:3290        -> en un mapa de fondo el jugador no se mueve
//
// O sea que «escena sí, partida no» **es lo que hace el motor**, no un invento.
// Lo encontró la sesión del 50; va aquí con su cita para que la frase falsa no
// vuelva a deducirse.
//
// Lo que sí es nuestro, y por eso se declara en vez de presumir de port:
//
//   1. **MSR no usa mapas de fondo.** No trae la lista que busca
//      `UI_LoadBackgroundMapList` (BaseMenu.cpp:980), así que `IsEmpty()` corta
//      en la línea 551 y su menú cae al mosaico de TGA. Elegir que aquí sí haya
//      fondo vivo es una decisión nuestra, y la pidió el jugador.
//   2. **El recorrido de la cámara.** El motor deja el mapa quieto con el
//      jugador congelado; el paseo lento, el ping-pong y el paralaje de este
//      archivo no salen de ningún sitio: son del mockup del experimento 13.
//   3. **Las entidades.** El motor las deja vivas y sólo marca al jugador;
//      nosotros no las montamos, porque sin jugador no hay a quién no atacar.
//
// Lo
// único que se hereda es la especificación que este proyecto se escribió a sí
// mismo en el experimento 13, que ya decía qué había que construir:
//
//     «Conservar la sobriedad del original (texto abajo a la izquierda, sin
//     cajas, la imagen manda) pero sustituir la pintura estática por EL MUNDO
//     EN VIVO: un mapa BSP real renderizado detrás del menú con una cámara
//     lenta. […] Cámara en una ruta fija: CatmullRomCurve3 con 4–6 puntos
//     definidos a mano por mapa, velocidad ~1 vuelta cada 90 s, ida y vuelta
//     (ping-pong), mirando a un punto de interés. Encuadre buscado: UNA silueta
//     fuerte a contraluz contra el cielo.»
//                                    doc/mockups/menu-principal-mockup.html:6-17
//
// Y la pintura de Anders Finér **no se toca**: sigue siendo el respaldo cuando no
// hay mapa horneado, que es donde ya estaba, y no se reconstruye en 3D. Eso lo
// decidió el mismo mockup y no lo cambiamos aquí.
//
// ── Por qué este archivo no sabe nada de Three ───────────────────────────────
//
// Porque todo `src/play/` es así a propósito, y porque la forma ya existía: la
// cámara de la muerte devuelve `{ pos, yaw, pitch }` desde `src/play/muerte.js`
// y `src/main.js:3543-3547` la aplica mientras esté puesta. Ésta es la misma
// pieza con otro motivo, así que se conduce por el mismo sitio y no hace falta
// una segunda `PerspectiveCamera` ni tocar al `Player`.
//
// Consecuencia práctica: el Catmull-Rom está escrito aquí a mano en vez de
// usarse el de Three. Son veinte líneas, se pueden probar en Node y no arrastran
// la biblioteca a una carpeta que vive sin ella.

// EL NOMBRE DEL MAPA NO SE ESCRIBE AQUÍ, y no es manía: `src/play/` no debe
// saber en qué mapa está, y hay una prueba del experimento 47 que lo exige
// (`test/juego_mapa47.test.mjs`, «el nombre del mapa tampoco, suelto»). Quien
// sabe de mapas es `src/play/mapa.js`, así que la clave de la tabla sale de
// ahí. Lo cazó esa prueba en cuanto se escribió `gatecity:` a mano.
import { MAPAS_PORTADOS } from "./mapa.js";

/** Los ejes y las unidades: los puntos se escriben en unidades del juego. */
export const UNIDADES_POR_METRO = 39.37;

/**
 * Cuánto se desplaza y cuánto gira la cámara con el ratón, y cuánto tarda en
 * llegar. Del mockup: «±0.3 u y ±1.5° según la posición del ratón normalizada,
 * con suavizado (lerp 0.05 por frame)».
 *
 * El `lerp` del mockup está POR FOTOGRAMA, y eso ata el suavizado a los fps: a
 * 144 Hz el paralaje llega el doble de rápido que a 72. Aquí se convierte a una
 * constante de tiempo —`1 - exp(-dt/TAU)`— para que se vea igual en las dos
 * pantallas. 0,05 por fotograma a 60 Hz es TAU ≈ 0,325 s, así que es el mismo
 * número mirado bien.
 */
export const PARALAJE = {
  desplazamiento: 0.3,          // metros a cada lado
  giro: (1.5 * Math.PI) / 180,  // radianes a cada lado
  tau: 0.325,                   // segundos de la constante de tiempo
};

/** Una vuelta entera, ida y vuelta, en segundos. */
export const SEGUNDOS_POR_VUELTA = 90;

/**
 * Los miradores, mapa por mapa. **Estos números se eligen mirando**, con
 * `npm run sonda:menu52 -- --miradores`, que fotografía candidatos y los pone
 * uno al lado del otro. Elegirlos leyendo coordenadas es cómo se consigue un
 * encuadre que mira a una pared.
 *
 * LAS UNIDADES, que es donde se pierden los signos: **los ejes son los de la
 * escena —los de Three— multiplicados por las unidades por metro**. NO son los
 * de GoldSrc. Un punto del `.bsp` en (x, y, z) se escribe aquí como (x, z, −y).
 * `probe.miradores.donde()` ya los devuelve en esta forma, para poder pegarlos
 * sin convertir nada a mano.
 *
 * `mirar` es el punto de interés; si es `null` la cámara mira adelante, por la
 * tangente del recorrido.
 *
 * Hay DOS por mapa a propósito, y no por variedad: con un solo mirador el valor
 * correcto y el valor de reposo serían el mismo y ninguna sonda podría fallar
 * por construcción. Es la lección del experimento 50, apartado 4 de CLAUDE.md.
 *
 * ── Lo que el barrido enseñó, y que cambió el encuadre ───────────────────────
 *
 * El mockup pedía «UNA silueta fuerte a contraluz contra el cielo». **En Gate
 * City no existe**, y se comprobó en vez de suponerse:
 *
 *   - `sondas/dondecielo.mjs` cuenta **137 caras de cielo, la mayor de 427 m2**,
 *     y todas son TECHO: el cielo de este mapa es una tapa agujereada, no un
 *     horizonte;
 *   - el barrido 2 de `sondas/miradores52.mjs` fue derecho a debajo de esa cara
 *     de 427 m2, a dos radios y dos alturas, y las dieciséis capturas salieron
 *     sin cielo: lo que hay ahí son barrancos de roca y helechos.
 *
 * Gate City es un pueblo de noche alumbrado por faroles, y lo oscuro es el
 * juego y no un fallo del port: `brightness "2"` y `gamma "3"` son los valores
 * del propio mod y el jugador puede moverlos en «Options» (`ajustes.js:193`).
 *
 * Así que el encuadre que se busca es otro y se dice: **una calle en
 * profundidad, con faroles cálidos sobre un fondo oscuro**, y el texto del menú
 * cayendo sobre la parte oscura. Es lo que el barrido 3 encontró.
 */
export const MIRADORES = {
  // `MAPAS_PORTADOS[0]` es Gate City. Se indexa en vez de nombrarse por la regla
  // del 47 de arriba; si un día se reordena esa lista, esta tabla se equivoca de
  // mapa en silencio, así que `test/juego_miradores.test.mjs` comprueba que el
  // mapa al que apunta es el que tiene los miradores medidos.
  [MAPAS_PORTADOS[0]]: [
    {
      // EL MERCADO, subiendo despacio por el lado este de la plaza. Es el que
      // más profundidad tiene: la calle se va en diagonal y los faroles quedan
      // escalonados hacia el fondo.
      nombre: "market row",
      puntos: [
        [1146, -497, -188], [1062, -458, -65], [964, -419, 46],
        [853, -379, 144], [730, -340, 228],
      ],
      mirar: [129, -509, -789],
      segundos: SEGUNDOS_POR_VUELTA,
    },
    {
      // LA PUERTA, por el lado oeste y en sentido contrario. El segundo caso, y
      // tiene que ser DISTINTO de verdad: si los dos miraran lo mismo desde
      // sitios parecidos volveríamos a tener un solo caso con dos nombres, que
      // es exactamente lo que el 50 enseñó a no hacer.
      nombre: "gate approach",
      puntos: [
        [-472, -458, -1806], [-595, -423, -1722], [-706, -389, -1624],
        [-804, -355, -1513], [-888, -320, -1390],
      ],
      mirar: [129, -509, -789],
      segundos: SEGUNDOS_POR_VUELTA,
    },
  ],
};

/** El mirador de un mapa, o `null` si ese mapa no tiene ninguno medido. */
export function miradorDe(mapa, cual = 0) {
  const lista = MIRADORES[mapa];
  if (!Array.isArray(lista) || !lista.length) return null;
  return lista[((cual % lista.length) + lista.length) % lista.length] ?? null;
}

const resta = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const suma = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const escala = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const largo = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * Catmull-Rom CENTRÍPETO (alfa = 1/2), que es el que trae Three por defecto y no
 * el uniforme.
 *
 * La diferencia no es cosmética: con puntos mal repartidos —y los de un mirador
 * lo están, porque se eligen por el encuadre y no por la distancia— el uniforme
 * se pasa de largo y hace un rizo. Una cámara de menú que se mete dentro de una
 * torre al llegar al tercer punto es el fallo que esto evita.
 *
 * `s` recorre [0, 1] sobre la polilínea entera. Curva ABIERTA: en los extremos
 * el vecino que falta se extrapola reflejando el siguiente, que es lo que hace
 * que el recorrido llegue al primer y al último punto en vez de acercarse.
 */
export function enLaCurva(puntos, s) {
  if (!Array.isArray(puntos) || !puntos.length) return null;
  if (puntos.length === 1) return [...puntos[0]];
  const tramos = puntos.length - 1;
  const t = Math.min(Math.max(s, 0), 1) * tramos;
  // El tramo, con el último cerrado por la derecha: en s = 1 queremos el final
  // del tramo de atrás, no el principio de uno que no existe.
  const i = Math.min(Math.floor(t), tramos - 1);
  const u = t - i;

  const p1 = puntos[i], p2 = puntos[i + 1];
  const p0 = i > 0 ? puntos[i - 1] : resta(escala(p1, 2), p2);
  const p3 = i + 2 < puntos.length ? puntos[i + 2] : resta(escala(p2, 2), p1);

  const ALFA = 0.5;
  // Un tramo de largo cero dejaría un 0/0. Se le da 1 y el tramo se ignora
  // solo, que es más útil que devolver NaN por un punto repetido.
  const d0 = Math.pow(largo(resta(p1, p0)), ALFA) || 1;
  const d1 = Math.pow(largo(resta(p2, p1)), ALFA) || 1;
  const d2 = Math.pow(largo(resta(p3, p2)), ALFA) || 1;

  // Las tangentes del tramo, en la parametrización del propio tramo.
  const tangente = (a, b, c, da, db) => escala(
    suma(resta(escala(resta(b, a), 1 / da), escala(resta(c, a), 1 / (da + db))),
         escala(resta(c, b), 1 / db)),
    d1,
  );
  const m1 = tangente(p0, p1, p2, d0, d1);
  const m2 = tangente(p1, p2, p3, d1, d2);

  // Hermite cúbico.
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2,    h11 = u3 - u2;
  return [0, 1, 2].map((k) => h00 * p1[k] + h10 * m1[k] + h01 * p2[k] + h11 * m2[k]);
}

/**
 * Dónde está el recorrido en el segundo `t`, de 0 a 1, ida y vuelta.
 *
 * Y NO es un diente de sierra rebotado, que es lo que «ping-pong» sugiere: con
 * velocidad constante la vuelta se nota como un tirón, porque en el extremo la
 * cámara cambia de sentido de golpe. Con el coseno la velocidad es cero justo
 * ahí y el giro no se ve. Cuesta lo mismo.
 *
 * `periodo` es la vuelta ENTERA —ida y vuelta—, no la ida.
 */
export function faseDelRecorrido(t, periodo = SEGUNDOS_POR_VUELTA) {
  if (!(periodo > 0)) return 0;
  const p = ((t / periodo) % 1 + 1) % 1;
  return (1 - Math.cos(2 * Math.PI * p)) / 2;
}

/**
 * El paseo de la cámara del menú.
 *
 * Guarda el paralaje suavizado —lo único con memoria que hay aquí— y devuelve en
 * cada paso `{ pos, yaw, pitch }` en METROS, listo para `camera.position.set` /
 * `camera.rotation.set`, igual que `camaraDeMuerte`.
 *
 * `avanzar(dt, { raton })` recibe el ratón ya normalizado a [-1, 1] en los dos
 * ejes, o `null` si no hay ratón encima; sin ratón el paralaje vuelve al centro
 * en vez de quedarse torcido donde lo dejaste.
 */
export function paseoDeMenu({
  mirador, U = UNIDADES_POR_METRO, periodo = SEGUNDOS_POR_VUELTA,
  paralaje = PARALAJE, desde = 0,
} = {}) {
  const puntos = (mirador?.puntos ?? []).map((p) => escala(p, 1 / U));
  const mirar = mirador?.mirar ? escala(mirador.mirar, 1 / U) : null;
  const vuelta = mirador?.segundos ?? periodo;
  let t = desde;
  // Dónde está el paralaje AHORA, que persigue a dónde lo quiere el ratón.
  let px = 0, py = 0;

  return {
    get valido() { return puntos.length >= 2; },
    /** Segundos de recorrido acumulados. Las sondas lo leen para no adivinar. */
    get t() { return t; },
    /** Con qué se construyó. Lo necesita la sonda para rehacerlo en otro punto. */
    get mirador() { return mirador; },
    get periodo() { return vuelta; },
    avanzar(dt = 0, { raton = null } = {}) {
      if (!puntos.length) return null;
      t += Math.max(0, dt);
      const s = faseDelRecorrido(t, vuelta);
      const pos = enLaCurva(puntos, s);

      // A dónde mira: al punto de interés, o adelante por la tangente. La
      // tangente se saca de dos muestras cercanas y no derivando el polinomio,
      // porque en los extremos la velocidad es cero y la dirección se pierde;
      // una diferencia con un paso fijo en `s` sigue apuntando bien ahí.
      let hacia;
      if (mirar) hacia = resta(mirar, pos);
      else {
        const PASO = 1e-3;
        const a = enLaCurva(puntos, Math.max(0, s - PASO));
        const b = enLaCurva(puntos, Math.min(1, s + PASO));
        hacia = resta(b, a);
        // Quieto en el extremo: mejor mirar al centro del recorrido que a un
        // vector nulo, que dejaría yaw y pitch en cero mirando al norte.
        if (largo(hacia) < 1e-9) hacia = resta(enLaCurva(puntos, 0.5), pos);
      }

      // Los mismos dos ejes que `camaraDeMuerte`: un giro `y` mira a (−sen,
      // −cos), así que el giro de un vector es `atan2(−x, −z)`, y el cabeceo es
      // NEGATIVO cuando se mira hacia abajo.
      const plano = Math.hypot(hacia[0], hacia[2]);
      let yaw = Math.atan2(-hacia[0], -hacia[2]);
      let pitch = plano > 1e-9
        ? Math.atan2(hacia[1], plano)
        : (hacia[1] >= 0 ? Math.PI / 2 : -Math.PI / 2);

      // El paralaje, con constante de tiempo y no con un lerp por fotograma.
      const qx = raton ? Math.min(Math.max(raton[0], -1), 1) : 0;
      const qy = raton ? Math.min(Math.max(raton[1], -1), 1) : 0;
      const k = paralaje.tau > 0 ? 1 - Math.exp(-Math.max(0, dt) / paralaje.tau) : 1;
      px += (qx - px) * k;
      py += (qy - py) * k;

      // Desplazar A LOS LADOS DE LA CÁMARA, no en los ejes del mundo: con el
      // mundo, el paralaje empuja de frente en la mitad del recorrido y no se
      // ve moverse nada. La derecha de la cámara con este yaw es (cos, 0, −sen).
      const dere = [Math.cos(yaw), 0, -Math.sin(yaw)];
      const final = [
        pos[0] + dere[0] * px * paralaje.desplazamiento,
        pos[1] + py * paralaje.desplazamiento,
        pos[2] + dere[2] * px * paralaje.desplazamiento,
      ];
      // Y el giro va AL CONTRARIO del desplazamiento, que es lo que hace que la
      // escena parezca girar alrededor del punto de interés en vez de que la
      // cámara se vaya: es la misma razón por la que un paralaje de fondo se
      // mueve menos que el primer plano.
      yaw -= px * paralaje.giro;
      pitch += py * paralaje.giro;

      return { pos: final, yaw, pitch, s, paralaje: [px, py] };
    },
  };
}
