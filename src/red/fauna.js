// LA FAUNA DEL SERVIDOR: los 69 bichos, simulados donde manda.
//
// Esto es el paso 5 de PROYECTO_10.md y el arnés que le faltaba a la manada.
// `src/play/manada.js` decide y mueve pero **no sabe nada del mundo**: no sabe
// si hay una pared delante, ni dónde está el suelo, ni si ve al jugador. Esas
// tres preguntas son de quien tenga la física, y hasta el 27 el único que la
// tenía era el navegador — por eso los bichos vivían allí.
//
// Ahora el servidor tiene la misma malla de colisión de Gate City y los mismos
// `Player` que el navegador, así que puede contestarlas. Y las contesta con las
// mismas dos preguntas de `UTIL_MoveToOrigin`, palabra por palabra las del
// arnés del navegador, porque si aquí hubiera un rayo distinto los bichos
// andarían distinto y eso se vería como un fallo de red.
//
// ── Lo que cambia respecto del navegador, y es lo interesante ──────────────
//
//   los OBJETIVOS  allí era uno —el jugador— y aquí son todos los conectados.
//                  Esa es la mudanza entera: un goblin que persigue «al
//                  jugador» no tiene sentido cuando hay cuatro.
//   el RASTRO      cada bicho apunta dónde ha estado. Hace falta porque el
//                  cliente los ve `ex_interp` en el pasado, así que cuando
//                  dice «le he pegado» habla de una posición vieja.
//   el DADO        el azar se inyecta. Con `Math.random` en cada navegador, dos
//                  jugadores veían dos pueblos; aquí hay uno y es de aquí.

import RAPIER from "@dimforge/rapier3d-compat";
import { Manada, U_POR_METRO } from "../play/manada.js";
import { solidosDeBichos } from "../play/solidos.js";
import { relacionDeRazas, RELACION } from "../bsp/razas.js";

/**
 * El censo y las fichas de los modelos, del disco.
 *
 * Del `bicho.json` de cada modelo se leen **sólo las secuencias y la caja**: la
 * malla, las texturas y las pistas de animación no le hacen falta al servidor,
 * que son 6 MB que no se cargan. De las secuencias salen las velocidades (el
 * `linearmovement` partido por la duración), qué animación es de bucle y cuánto
 * dura cada una; de la caja, el cilindro con el que choca.
 */
export async function censoDeDisco({ base = "build/gatecity", leer = null } = {}) {
  const { readFile } = await import("node:fs/promises");
  const json = leer ?? (async (ruta) => JSON.parse(await readFile(ruta, "utf8")));
  const censo = await json(`${base}/bichos.json`).catch(() => null);
  if (!censo?.colocados?.length) return null;
  const secuenciasPorClave = new Map();
  const cajasPorClave = new Map();
  for (const m of censo.modelos ?? []) {
    const ficha = await json(`${base}/${m.carpeta}/bicho.json`).catch(() => null);
    if (!ficha) continue;
    secuenciasPorClave.set(m.clave, ficha.secuencias ?? []);
    cajasPorClave.set(m.clave, ficha.cajaMedida ?? ficha.caja ?? null);
  }
  return { censo, secuenciasPorClave, cajasPorClave };
}

/**
 * LA FAUNA: la manada más el mundo que hace falta para simularla.
 *
 * `mundo` es lo que devuelve `mundoDeNivel`: `{ world, perfil }`, con
 * `world.world` de Rapier. `jugadores()` devuelve los que hay ahora mismo, cada
 * uno con su `cuerpo` — y se pide en cada paso y no se guarda, porque entran y
 * salen.
 */
export class Fauna {
  constructor({
    censo, secuenciasPorClave, cajasPorClave,
    mundo, jugadores = () => [], azar = Math.random, golpear = null,
  } = {}) {
    if (!censo) throw new Error("la fauna necesita un censo de bichos");
    if (!mundo?.world?.world) throw new Error("la fauna necesita un mundo con física");
    this.mundo = mundo;
    this.jugadores = jugadores;
    this.golpear = golpear;
    this.U = censo.unidadesPorMetro ?? U_POR_METRO;
    this.manada = new Manada(censo, { secuenciasPorClave, cajasPorClave, azar });
    /** La tabla de razas del censo, para saber quién avisa a quién al morir. */
    this.razas = new Map(censo.razas ?? []);
    /** Los cilindros: el motor los hace `SOLID_SLIDEBOX`. */
    this.solidos = solidosDeBichos(this.manada, mundo.world.world, RAPIER, {
      unidadesPorMetro: this.U,
    });
    this.pasos = 0;
    this.arnes = this._arnes();
    this.refrescarConsultas();
  }

  /**
   * **EL ÁRBOL DE CONSULTAS, al día.** Y esto costó el primer cero del 28.
   *
   * Rapier no responde a un rayo contra un colisionador que acaba de crearse o
   * de moverse hasta que alguien actualiza su árbol, y quien lo actualiza es
   * `world.step()`. En el navegador eso pasaba solo —el bucle da un paso de
   * física cada fotograma, y `main.js` da uno más justo al montar el mundo—,
   * así que la pregunta «¿hay suelo debajo?» funcionaba sin que nadie lo
   * pensara.
   *
   * En el servidor no: el único que llamaba a `step()` era `Player.step`, o sea
   * que **con la partida vacía la física nunca se actualizaba**. Y el síntoma no
   * era un error: era que `suelo()` devolvía `null` para los 69, o sea «no hay
   * suelo delante», o sea los 69 bichos quietos en su sitio con `roam 1` puesto.
   * Diez segundos de servidor, 0,00 m recorridos, ni una excepción.
   *
   * Se refrescan las consultas y no se da un paso de física: un `step()` aquí
   * sería un segundo paso de gravedad para los jugadores en el mismo tick.
   */
  refrescarConsultas() {
    const f = this.mundo.world.world;
    f.propagateModifiedBodyPositionsToColliders?.();
    f.updateSceneQueries?.();
  }

  get n() { return this.manada.n; }

  /**
   * ¿Son aliados? La misma cuenta que hace el navegador desde el 21, con la
   * tabla que horneó `tools/bichos.mjs`. Sin ella, matar a uno en el pueblo no
   * avisa a nadie — y avisar a cero se ve igual que no avisar.
   */
  sonAliados(a, b) {
    const ra = a?.o?.ficha?.ia?.raza ?? a?.ficha?.ia?.raza;
    const rb = b?.o?.ficha?.ia?.raza ?? b?.ficha?.ia?.raza;
    if (!ra || !rb) return false;
    return relacionDeRazas(this.razas, ra, rb) === RELACION.ALIADO;
  }

  /** El identificador con el que un bicho conoce a un jugador. */
  static nombreDeJugador(id) { return `j${id}`; }

  _jugadorDe(id) {
    const n = Number(String(id).slice(1));
    return this.jugadores().find((j) => j.id === n && j.cuerpo) ?? null;
  }

  _arnes() {
    const U = this.U;
    const fisica = this.mundo.world.world;
    // El cilindro propio de un bicho, para que su rayo no choque con él mismo.
    const mio = (i) => (i ? this.solidos?.puestos.find((q) => q.instancia === i)?.cuerpo : undefined);

    return {
      libre: (x, y, z, dx, dz, dist, i = null) => {
        // Desde la CINTURA, no desde los pies: un rayo a ras de suelo choca con
        // cada adoquín y el bicho se pasa la vida girando.
        const o = { x, y: y + 0.9, z };
        // Y SIN CONTAR SU PROPIO CILINDRO: con `solid: true` un rayo que nace
        // dentro de una forma choca a distancia cero, así que «¿hay hueco
        // delante?» contestaría que no SIEMPRE y el goblin se quedaría en el
        // sitio con la animación de correr puesta.
        const g = fisica.castRay(new RAPIER.Ray(o, { x: dx, y: 0, z: dz }), dist, true,
          undefined, undefined, undefined, mio(i));
        return !g;
      },
      suelo: (x, y, z, i = null) => {
        // Tampoco cuenta su propio cilindro, y aquí el síntoma era precioso: el
        // suelo salía un metro por encima de donde estaba, o sea 39 unidades,
        // que es justo lo que el escalón de 18 no deja subir. El bicho daba el
        // paso y lo deshacía, cada fotograma.
        const g = fisica.castRay(new RAPIER.Ray({ x, y: y + 1.0, z }, { x: 0, y: -1, z: 0 }), 3, true,
          undefined, undefined, undefined, mio(i));
        return g ? y + 1.0 - g.timeOfImpact : null;
      },
      /**
       * A QUIÉN PUEDE ATACAR UN BICHO: **todos los jugadores que haya dentro**.
       *
       * Ésta es la línea que justifica el experimento. En el navegador era uno y
       * a fuego («el jugador»), porque en un navegador no hay otros. Aquí son
       * los conectados, y el goblin elige al más cercano con la regla del mod
       * —`CAN_RETALIATE` y sólo si es un jugador—, que ya estaba escrita en
       * `ia.js` y hasta hoy no tenía entre quién elegir.
       *
       * La raza del jugador no sale de ningún script: el motor la devuelve a
       * fuego como `human` (script.cpp:1546). De ahí sale que 33 de los 69 sean
       * hostiles y los otros 36 no.
       */
      objetivos: (i) => {
        const fuera = [];
        for (const j of this.jugadores()) {
          if (!j.cuerpo || j.vivo === false) continue;
          const p = j.cuerpo.feet;
          const alto = j.cuerpo.perfil?.height ?? 1.8;
          fuera.push({
            id: Fauna.nombreDeJugador(j.id),
            donde: [p[0] * U, (p[1] + alto / 2) * U, p[2] * U],
            esJugador: true,
            // LA RELACIÓN ES DE CADA BICHO, no una sola para todos.
            relacion: i?.ficha?.relacion ?? 0,
          });
        }
        return fuera;
      },
      /**
       * LÍNEA DE VISIÓN, que es `$cansee` y sin ella la IA es un radar.
       *
       * De los OJOS a los OJOS: un rayo entre los pies pasa por debajo de una
       * mesa y por encima de un escalón, y las dos cosas se ven como «me ve a
       * través de la pared». Y lo que hay que preguntar no es a qué distancia
       * choca: es CONTRA QUÉ — el rayo termina en el ojo y por el camino se topa
       * con la cápsula del propio jugador medio metro antes.
       */
      veA: (i, id) => {
        const j = this._jugadorDe(id);
        if (!j) return false;
        const n = i.donde;
        const alto = ((i.ficha.ia?.alto ?? i.ficha.alto ?? 60) * 0.9) / U;
        const o = { x: n[0], y: n[1] + alto, z: n[2] };
        const p = j.cuerpo.eye;
        const d = { x: p[0] - o.x, y: p[1] - o.y, z: p[2] - o.z };
        const L = Math.hypot(d.x, d.y, d.z);
        if (!(L > 0)) return true;
        d.x /= L; d.y /= L; d.z /= L;
        const g = fisica.castRayAndGetNormal(new RAPIER.Ray(o, d), L, true,
          undefined, undefined, undefined, mio(i));
        if (!g) return true;
        return g.collider === j.cuerpo.collider;
      },
      /** Cuando un bicho acierta. Quien lo cobra es la partida. */
      golpear: (i, id, dano) => {
        const j = this._jugadorDe(id);
        if (!j) return null;
        return this.golpear?.(i, j, dano) ?? null;
      },
    };
  }

  /**
   * UN PASO. Se llama desde el paso fijo del servidor, así que el `dt` es
   * siempre el mismo — que es lo que hace que la manada sea reproducible.
   */
  paso(dt) {
    this.refrescarConsultas();
    this.arnes.ahora = this.manada.t;
    this.manada.cazar(dt, this.arnes);
    this.manada.relojes(dt);
    // Los cilindros SIGUEN a los bichos: son cuerpos cinemáticos y sin esto el
    // goblin se mueve y su colisión se queda donde estaba.
    this.solidos?.seguir();
    this.manada.apuntarRastro(this.manada.t);
    this.pasos++;
  }

  /**
   * **UN GOLPE DEL JUGADOR A UN BICHO, resuelto aquí.**
   *
   * `t` es el instante al que hay que rebobinar: el presente del servidor menos
   * la latencia del que pega menos su ventana de interpolación. Se comprueba la
   * distancia contra **dónde estaba el bicho entonces**, que es lo que el
   * jugador tenía en pantalla. Sin eso, pegarle a un goblin que corre falla
   * siempre y no se lee como un problema de red: se lee como que la espada
   * atraviesa a los monstruos.
   */
  pegar({ id, dano, alcance, cubo = null, tipo = "", desde = null, t = null, quien = null, dados = {} }) {
    const i = this.manada.de(id);
    if (!i || i.muerto) return { vale: false, porque: "no está o ya está muerto" };
    if (desde && alcance > 0) {
      const p = t === null ? [...i.donde] : this.manada.donde(id, t);
      // En unidades, porque el alcance del arma viene del script del mod.
      const d = Math.hypot((p[0] - desde[0]) * this.U, (p[1] - desde[1]) * this.U, (p[2] - desde[2]) * this.U);
      // El margen es el ancho del bicho: el alcance del motor se mide contra el
      // casco de la entidad y no contra su origen, así que medir al centro y no
      // dar margen quitaría media espada de alcance a cada golpe.
      const margen = (i.ficha.ia?.ancho ?? i.ficha.ancho ?? 32) + 16;
      if (d > alcance + margen) return { vale: false, porque: `a ${Math.round(d)} u y el arma llega a ${Math.round(alcance)}`, lejos: true };
    }
    const r = this.manada.herir(i, dano, {
      cubo, tipo, ahora: this.manada.t, dados: { ...dados, quien },
      quien, esAliado: (a, b) => this.sonAliados(a, b),
    });
    // Al morir se le quita el cilindro. `pev->solid = SOLID_NOT` en
    // `SUB_StartFadeOut` (combat.cpp:642): sin esto el cadáver sigue siendo un
    // muro invisible en medio de la calle, y eso no se ve, se choca.
    if (r.muerto) this.solidos?.quitar(i);
    // El daño va en la respuesta y no sólo en la vida que queda: el navegador lo
    // dice en pantalla («13,4 de daño a un goblin») y sacándolo de la resta no
    // puede — con el golpe que mata, la vida se queda en 0 y la resta miente.
    return { vale: true, dano: Math.round(dano * 10) / 10, ...r };
  }

  get resumen() {
    const vivos = this.manada.vivos().length;
    return { bichos: this.manada.n, vivos, muertos: this.manada.n - vivos, solidos: this.solidos?.n ?? 0 };
  }
}
