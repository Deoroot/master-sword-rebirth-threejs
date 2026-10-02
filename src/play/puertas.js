// LAS PUERTAS de Gate City: nueve, y hasta ahora eran pared.
//
// Estaban horneadas dentro del trimesh del mundo, o sea que existían como
// dibujo y como obstáculo y no como puerta. Esto las saca de ahí: cada una
// tiene su malla, su bisagra y su propio colisionador, y gira.
//
// ── Lo que es del motor, y son cuatro números por puerta ───────────────────
//
// `CBaseDoor` / `CRotDoor`, y los valores los trae cada entidad del `.bsp`:
//
//   distance 90    los grados que abre
//   speed    100   grados por segundo
//   wait     4     segundos abierta antes de cerrarse sola
//   movesnd  9     el sonido, que todavía no suena
//
// Y las banderas que deciden cómo, ninguna de las cuales traen las nueve de
// Gate City — así que las nueve son de eje vertical, hacia delante y **se abren
// al tocarlas**, que es lo que hace `CBaseDoor` sin `SF_DOOR_USE_ONLY`:
//
//   1    SF_DOOR_ROTATE_BACKWARDS   al revés
//   64   SF_DOOR_ROTATE_Z           bisagra horizontal
//   128  SF_DOOR_ROTATE_X
//   256  SF_DOOR_USE_ONLY           hay que pulsar usar
//
// ── Y lo que es nuestro ────────────────────────────────────────────────────
//
// El colisionador. El motor mueve el brush y resuelve el choque con su propio
// trazado; aquí Rapier lleva un cuerpo cinemático por puerta con la malla de la
// puerta, y se gira igual que el nodo de dibujo. La frontera es la misma de
// siempre: **el movimiento es del motor, el choque es de Rapier.**

import * as THREE from "three";

/** Los cuatro estados de `CBaseDoor`: `m_toggle_state`. */
export const ESTADO = {
  CERRADA: "cerrada", ABRIENDO: "abriendo", ABIERTA: "abierta", CERRANDO: "cerrando",
};

/**
 * ¿ESTÁ LA HOJA ENCIMA DE ESE PUNTO, con el ángulo que tiene ahora?
 *
 * Hace falta para `CBaseDoor::Blocked`, y se resuelve al revés de como parece:
 * en vez de girar la caja de la puerta, se gira el PUNTO al marco de la puerta
 * y se compara con la caja cerrada, que es un rectángulo alineado. Girar una
 * caja da otra caja más grande que la hoja, y con ella una puerta abierta del
 * todo seguiría «tocando» a alguien que está a un metro.
 *
 * El radio es el del jugador: la hoja no tiene que pasar POR él, tiene que no
 * llegar a tocarlo.
 */
export function hojaEncimaDe(ficha, angulo, signo, punto, radio = 0.4) {
  const a = (-angulo * Math.PI) / 180 * signo;
  const dx = punto[0] - ficha.bisagra[0];
  const dz = punto[2] - ficha.bisagra[2];
  const c = Math.cos(a), s = Math.sin(a);
  // Rotación sobre +Y, que es el eje de la bisagra.
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  const ly = punto[1] - ficha.bisagra[1];
  const min = ficha.caja.min, max = ficha.caja.max, b = ficha.bisagra;
  return lx > min[0] - b[0] - radio && lx < max[0] - b[0] + radio &&
         lz > min[2] - b[2] - radio && lz < max[2] - b[2] + radio &&
         // En vertical no hay giro, así que la comparación es directa. Con
         // margen hacia arriba: el punto que se pasa son los PIES.
         ly > min[1] - b[1] - 0.1 && ly < max[1] - b[1] + 1.8;
}

/**
 * HACIA QUÉ LADO SE ABRE, que es `CBaseDoor::DoorGoUp` (doors.cpp:609).
 *
 * Y no es un detalle de acabado: una puerta que se abre hacia ti te empuja, y
 * con un cuerpo cinemático te empotra contra la pared. Lo que hace el motor:
 *
 *     Vector vec   = activador.origin - puerta.origin;
 *     Vector vnext = (activador.origin + v_forward * 10) - puerta.origin;
 *     if ((vec.x * vnext.y - vec.y * vnext.x) < 0) sign = -1;
 *
 * Es un producto cruzado en el plano horizontal entre dónde estás respecto a la
 * bisagra y hacia dónde miras. Y se simplifica: como `vnext = vec + f·10`, el
 * término `vec × vec` se va y queda `10 · (vec × f)`. O sea que **lo único que
 * decide es de qué lado de tu mirada cae la bisagra**, y por eso empujar la
 * puerta la abre hacia donde empujas en vez de en tu contra.
 *
 * Dos cosas que hay que traducir y no copiar:
 *
 * - En ejes de Three (`x, z, −y` del `.bsp`) ese cruce pasa a ser `dz·fx −
 *   dx·fz`. Copiar la fórmula literal abre las nueve al revés.
 * - El motor lo condiciona a `pev->movedir.y`, o sea sólo para bisagra
 *   vertical. Una trampilla no tiene «tu lado».
 *
 * Con `SF_DOOR_ONEWAY` no se mira a nadie: manda la bandera de la entidad.
 *
 * @param ficha    la de `malla.json`: `bisagra`, `sentido`, `eje`, `unaSolaDireccion`
 * @param desde    dónde está quien abre, en metros de escena
 * @param mirando  hacia dónde mira, vector plano [x, 0, z]
 */
export function ladoDeApertura(ficha, desde, mirando) {
  if (ficha.unaSolaDireccion || !desde || !mirando) return ficha.sentido;
  if (ficha.eje !== "y") return ficha.sentido;
  const dx = desde[0] - ficha.bisagra[0];
  const dz = desde[2] - ficha.bisagra[2];
  const cruz = dz * mirando[0] - dx * mirando[2];
  // `< 0` y no `<= 0`: con el cruce exactamente a cero el motor deja el +1.
  return ficha.sentido * (cruz < 0 ? -1 : 1);
}

/**
 * ¿SE ABRE AL TOCARLA? Y la respuesta no es sólo `SF_DOOR_USE_ONLY` (el 70).
 *
 * `CBaseDoor::DoorTouch` (doors.cpp:516-543) tiene una salida temprana que yo
 * no había portado, con su comentario delante y todo:
 *
 *     // If door is somebody's target, then touching does nothing.
 *     // You have to activate the owner (e.g. button).
 *     if (!FStringNull(pev->targetname))
 *     {
 *         PlayLockSounds(pev, &m_ls, TRUE, FALSE);
 *         return;
 *     }                                             doors.cpp:531-538
 *
 * O sea: **tener nombre ya cierra la puerta al tacto**, traiga o no traiga la
 * bandera. Y no es teórico: las dos hojas de `door2` de Edana —la casa del
 * alcalde— tienen `targetname`, las abre un `trigger_once` desde dentro, y
 * hasta el 70 se abrían solas al acercarse. Encima hay dos
 * `trigger_changetarget` (`mayorsdoor` y `mayorsdoor2`) cuyo trabajo es
 * enchufar y desenchufar ese disparador: una puerta que se abre al empujarla
 * convierte esa pareja en adorno.
 *
 * Las otras cinco rotatorias no tienen nombre, así que para ellas esto no
 * cambia nada — que es exactamente por qué sobrevivió desde el 48: **cinco de
 * siete daban el mismo resultado con la regla mal**.
 */
export function seAbreAlTocar(ficha) {
  if (ficha.soloUsar) return false;               // SF_DOOR_USE_ONLY
  if (ficha.nombre) return false;                 // doors.cpp:533-538
  return true;
}

/** A qué distancia se abre al acercarse, en unidades de GoldSrc. */
//
// El motor no usa una distancia: usa el `Touch` de la caja de la puerta contra
// la del jugador, o sea el contacto. Aquí se aproxima con un radio, y el número
// no es a ojo — es media caja de jugador (16) más el paso (18), que es lo que
// el jugador recorre entre dos fotogramas a velocidad de carrera.
export const ALCANCE = 34;

/**
 * Monta las nueve puertas: el grupo de dibujo y los colisionadores.
 *
 * `manifiesto` es `malla.json`; `bin` su binario ya descargado.
 */
export function montarPuertas(manifiesto, bin, { materialDe, mundo = null, RAPIER = null } = {}) {
  const fichas = manifiesto.interactivas?.puertas ?? [];
  if (!fichas.length) return null;
  const T = manifiesto.bin.tramos;
  const grupo = new THREE.Group();
  grupo.name = "puertas";
  const puertas = [];

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
    const uv1 = arr("Uvs1", Float32Array);
    const a1 = new THREE.BufferAttribute(uv1, 2);
    geo.setAttribute("uv1", a1);
    geo.setIndex(new THREE.BufferAttribute(arr("Indices", Uint32Array), 1));
    const materiales = [];
    f.grupos.forEach((g, i) => {
      geo.addGroup(g.start, g.count, i);
      materiales.push(materialDe(g));
    });
    geo.computeBoundingSphere();

    const malla = new THREE.Mesh(geo, materiales);
    // El nodo va EN LA BISAGRA y la malla está en coordenadas locales suyas:
    // por eso el horneado la emite sin el `origin` de la entidad. Girar el nodo
    // es girar la puerta sobre su eje, sin una sola resta aquí.
    const nodo = new THREE.Group();
    nodo.position.set(f.bisagra[0], f.bisagra[1], f.bisagra[2]);
    nodo.add(malla);
    grupo.add(nodo);

    // El colisionador: un cuerpo cinemático con la malla de choque de la
    // puerta. Cinemático y no fijo porque se mueve, y no dinámico porque quien
    // manda es el reloj de la puerta y no la física.
    let cuerpo = null, colisionador = null;
    if (mundo && RAPIER) {
      const cp = arr("ChoquePositions", Float32Array);
      const ci = arr("ChoqueIndices", Uint32Array);
      cuerpo = mundo.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(f.bisagra[0], f.bisagra[1], f.bisagra[2])
      );
      colisionador = mundo.createCollider(
        RAPIER.ColliderDesc.trimesh(cp, ci), cuerpo
      );
    }

    puertas.push({
      ficha: f, nodo, malla, cuerpo, colisionador,
      estado: ESTADO.CERRADA,
      // El ángulo actual, en grados y con signo: 0 cerrada, `grados` abierta.
      angulo: 0,
      espera: 0,
      // Hacia qué lado va ESTA apertura. Se decide al abrir, no al hornear.
      signo: f.sentido,
    });
  }

  /** El eje de giro en ejes de Three, según las banderas del `.bsp`. */
  const ejeDe = (p) => (p.ficha.eje === "x" ? "x" : p.ficha.eje === "z" ? "z" : "y");

  const haciaDonde = (p, desde, mirando) => ladoDeApertura(p.ficha, desde, mirando);

  const colocar = (p) => {
    const a = (p.angulo * Math.PI) / 180 * p.signo;
    p.nodo.rotation[ejeDe(p)] = a;
    if (p.cuerpo) {
      const q = new THREE.Quaternion().setFromEuler(p.nodo.rotation);
      p.cuerpo.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    }
  };
  for (const p of puertas) colocar(p);

  return {
    grupo, puertas,
    n: puertas.length,
    triangulos: fichas.reduce((a, f) => a + f.triangulos, 0),

    /**
     * Las asas de Rapier de sus colisionadores — el 75.
     *
     * Una `func_door_rotating` es `SOLID_BSP`, y un objeto que se queda encima
     * de una hoja **no toca suelo** para el motor: `SV_PointContents` mira el
     * hull del mundo y de las entidades sólo las `SOLID_NOT` (world.cpp:625-626
     * y 695-709).
     */
    asas() {
      return puertas.filter((p) => p.colisionador).map((p) => p.colisionador.handle);
    },

    /**
     * Empuja una puerta a abrirse. Devuelve si ha hecho algo.
     *
     * `desde` y `mirando` son del que abre, y son lo que decide el lado. Sin
     * ellos se abre hacia donde diga la entidad, que es lo que pasa cuando la
     * abre un botón y no una persona.
     */
    abrir(p, { desde = null, mirando = null } = {}) {
      if (p.estado === ESTADO.ABRIENDO) return false;
      // Un retroceso por bloqueo no se cancela tocándola: ver `cierreForzado`.
      if (p.cierreForzado) return false;
      if (p.estado === ESTADO.ABIERTA) {
        // Tocarla otra vez estando abierta REARMA la espera, que es lo que hace
        // el motor: quedarse en el vano no deja que se te cierre encima.
        p.espera = p.ficha.espera;
        return false;
      }
      // El lado se fija AL ARRANCAR y no cada fotograma: recalcularlo mientras
      // gira haría que la hoja cambiara de sentido a media apertura al girar
      // tú la cámara, que es peor que abrirse al revés.
      p.signo = haciaDonde(p, desde, mirando);
      p.estado = ESTADO.ABRIENDO;
      return true;
    },

    /**
     * El reloj de las nueve. `cerca(p)` dice si el jugador la está tocando.
     *
     * Las puertas no se cierran con alguien delante, y eso no es amabilidad:
     * `CBaseDoor::DoorGoDown` vuelve a esperar si hay un bloqueo. Sin eso, una
     * puerta cinemática atraviesa al jugador y lo deja dentro de la pared.
     */
    tic(dt, {
      cerca = () => false, alMoverse = null, desde = null, mirando = null,
      radioDelQueAbre = 0.4,
    } = {}) {
      for (const p of puertas) {
        const tope = p.ficha.grados;
        const paso = p.ficha.velocidad * dt;
        const tocando = cerca(p) && seAbreAlTocar(p.ficha);
        const estabaQuieta = p.estado === ESTADO.CERRADA || p.estado === ESTADO.ABIERTA;
        if (tocando) this.abrir(p, { desde, mirando });
        // `noiseMoving` suena al ARRANCAR, en los dos sentidos, y una sola vez
        // por tramo. Dispararlo cada fotograma mientras gira daria noventa
        // chirridos superpuestos; dispararlo solo al abrir dejaria muda la
        // vuelta. Quien escuche decide si tiene archivo: `movesnd 9` es
        // `doors/doormove9.wav`, que es de Half-Life y Rebirth no lo trae.
        if (alMoverse && estabaQuieta && p.estado === ESTADO.ABRIENDO) alMoverse(p);

        // `CBaseDoor::Blocked` (doors.cpp:725): si algo la traba, **se
        // invierte**. Abriendo se cierra, cerrando se abre. Nunca empuja.
        //
        // Sin esto, una hoja cinemática que barre el sitio donde estás te
        // mete en la pared, y ahí ya no sales: es lo de «el jugador se queda
        // atascado a la puerta». Y no vale con mirar sólo si está cerca —
        // tiene que ser si la hoja, EN EL ÁNGULO QUE TIENE AHORA, está encima
        // de él, que es lo que mira `hojaEncimaDe`.
        // Y se mira A DÓNDE IRÍA, no dónde está. Lo escribí con el ángulo
        // actual y la puerta se quedaba clavada: una vez que la hoja tocaba al
        // jugador, cada fotograma cambiaba de estado y ninguno la movía, así
        // que oscilaba en el sitio para siempre. Medido: 3,33° y ahí se
        // quedaba. Preguntando por el ángulo siguiente, al invertirse el
        // destino cae del lado libre y la hoja sí retrocede.
        if (desde && !p.ficha.atravesable &&
            (p.estado === ESTADO.ABRIENDO || p.estado === ESTADO.CERRANDO)) {
          const iria = p.estado === ESTADO.ABRIENDO
            ? Math.min(tope, p.angulo + paso)
            : Math.max(0, p.angulo - paso);
          if (hojaEncimaDe(p.ficha, iria, p.signo, desde, radioDelQueAbre)) {
            const abriendo = p.estado === ESTADO.ABRIENDO;
            p.estado = abriendo ? ESTADO.CERRANDO : ESTADO.ABRIENDO;
            // Y si la manda a cerrarse, ese retroceso es INTOCABLE hasta que
            // dé un paso. Gana a «no se cierra con alguien delante» y gana a
            // volver a abrirse por seguir tocándola.
            //
            // Sin eso las reglas se pisan y la puerta se queda clavada: el
            // bloqueo la manda a cerrar y la cercanía la devuelve a abrir en
            // el mismo sitio, cada fotograma. Medido: **se paraba a 10° para
            // siempre**, ni abierta ni cerrada.
            //
            // Pasa aquí y no en el motor porque el motor apaga el `Touch` de
            // la puerta mientras se mueve (`SetTouch(NULL)`, doors.cpp:543) y
            // lo vuelve a poner arriba y abajo; lo suyo se dispara por
            // CONTACTO y lo nuestro es un radio que se cumple siempre. Un
            // paso de margen es lo que hace que el rebote avance en vez de
            // quedarse parado, y el resultado es el rebote de puerta de
            // Half-Life de toda la vida.
            p.cierreForzado = abriendo;
            p.trabada = (p.trabada ?? 0) + 1;
            continue;
          }
        }

        if (p.estado === ESTADO.ABRIENDO) {
          p.angulo = Math.min(tope, p.angulo + paso);
          if (p.angulo >= tope) { p.estado = ESTADO.ABIERTA; p.espera = p.ficha.espera; }
          colocar(p);
        } else if (p.estado === ESTADO.ABIERTA) {
          if (tocando) { p.espera = p.ficha.espera; continue; }
          p.espera -= dt;
          if (p.espera <= 0) p.estado = ESTADO.CERRANDO;
        } else if (p.estado === ESTADO.CERRANDO) {
          if (estabaQuieta && alMoverse) alMoverse(p);
          if (tocando && !p.cierreForzado) { p.estado = ESTADO.ABIERTA; p.espera = p.ficha.espera; continue; }
          p.angulo = Math.max(0, p.angulo - paso);
          if (p.angulo <= 0) p.estado = ESTADO.CERRADA;
          // El retroceso ya ha dado su paso: a partir de aquí vuelve a mandar
          // quien la toque.
          p.cierreForzado = false;
          colocar(p);
        }
      }
    },

    /** Cuál está tocando el jugador, si alguna. En metros. */
    cercaDe(punto, unidadesPorMetro = 39.37) {
      const r = ALCANCE / unidadesPorMetro;
      return puertas.filter((p) => {
        const c = p.ficha.caja;
        return punto[0] >= c.min[0] - r && punto[0] <= c.max[0] + r &&
               punto[1] >= c.min[1] - r && punto[1] <= c.max[1] + r &&
               punto[2] >= c.min[2] - r && punto[2] <= c.max[2] + r;
      });
    },
  };
}
