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
import { Manada, U_POR_METRO, ojoDe } from "../play/manada.js";
import { solidosDeBichos } from "../play/solidos.js";
import { Monsterclip } from "../play/monsterclip.js";
import { Aparecedor, delCenso } from "../play/aparecer.js";
import { relacionDeRazas, RELACION } from "../bsp/razas.js";

import { MAPA_POR_DEFECTO, baseDe } from "../play/mapa.js";
const BASE_POR_DEFECTO = baseDe(MAPA_POR_DEFECTO);
/**
 * El censo y las fichas de los modelos, del disco.
 *
 * Del `bicho.json` de cada modelo se leen **sólo las secuencias y la caja**: la
 * malla, las texturas y las pistas de animación no le hacen falta al servidor,
 * que son 6 MB que no se cargan. De las secuencias salen las velocidades (el
 * `linearmovement` partido por la duración), qué animación es de bucle y cuánto
 * dura cada una; de la caja, el cilindro con el que choca.
 */
export async function censoDeDisco({ base = BASE_POR_DEFECTO, leer = null } = {}) {
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
    disparar = null,
  } = {}) {
    if (!censo) throw new Error("la fauna necesita un censo de bichos");
    if (!mundo?.world?.world) throw new Error("la fauna necesita un mundo con física");
    this.mundo = mundo;
    this.jugadores = jugadores;
    this.golpear = golpear;
    /**
     * EL CABLE AL MAPA (el 68): `FireTargets` desde el aparecedor.
     *
     * `perishtarget` y `fireallperish` son `FireTargets` a secas
     * (msmapents.cpp:990 y :1296), o sea que pueden apuntar a **cualquier**
     * entidad del `.bsp`, no sólo a otra área. Hasta el 68 los dos se
     * reinyectaban únicamente en el propio aparecedor, y eso bastaba en Gate City
     * por casualidad —`spawn_bowguys` apunta a `skele_treasure`, que **es** un
     * área—, pero el corral de Edana apunta a un `mstrig_multi` y a dos
     * `trigger_relay`, que son del mapa. Sin este gancho la cadena de las tres
     * oleadas muere en la primera sin un solo error.
     *
     * Se inyecta en vez de importarse porque la `Fauna` corre también en el
     * servidor, donde el bus de disparadores es otro objeto.
     */
    this.disparar = disparar;
    this.U = censo.unidadesPorMetro ?? U_POR_METRO;
    this.manada = new Manada(censo, { secuenciasPorClave, cajasPorClave, azar });
    /** La tabla de razas del censo, para saber quién avisa a quién al morir. */
    this.razas = new Map(censo.razas ?? []);
    /** Los cilindros: el motor los hace `SOLID_SLIDEBOX`. */
    this.solidos = solidosDeBichos(this.manada, mundo.world.world, RAPIER, {
      unidadesPorMetro: this.U,
    });
    /**
     * LA VALLA DE LOS MONSTRUOS: los 101 `func_monsterclip` de Gate City.
     *
     * Viene del nivel y no de Rapier a propósito — el jugador la atraviesa
     * (`world.cpp:1196`), así que un colisionador en el mundo común lo dejaría
     * tapiado. Ver src/play/monsterclip.js.
     */
    this.valla = new Monsterclip(mundo.monsterclip ?? []);
    /**
     * LAS 16 ÁREAS DE APARICIÓN, y con ellas los 38 bichos que no estaban donde
     * creíamos. Ver src/play/aparecer.js: una entidad con `spawnarea` es una FICHA
     * y no un monstruo, el motor la borra al registrarla, y lo que el jugador ve
     * es que a los 3 s aparecen y que al matarlos vuelven.
     *
     * El dado es el MISMO que el de la manada, y eso importa: con `Math.random`
     * por su cuenta, dos servidores con la misma semilla verían aparecer cosas
     * distintas — que es el fallo del 28 otra vez.
     */
    this.aparecedor = new Aparecedor({ ...delCenso(censo), azar });
    // `solidosDeBichos` ya le ha puesto cilindro a todo el que no nace dormido; se
    // apunta para poder cuadrarlo después sin recorrer la lista de colisionadores.
    for (const i of this.manada.instancias) i.conCilindro = !i.dormido;
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
      // LA VALLA viaja en el arnés y la mira `avanzar`, no `libre`: ver el
      // comentario de `avanzar` en manada.js y src/bsp/clip.js. Meterla en
      // `libre` la metería también en el rumbo del paseo y en la vista, que en
      // el motor NO la ven (`UTIL_TraceLine` pasa `FALSE`, pr_cmds.cpp:335).
      valla: this.valla,
      libre: (x, y, z, dx, dz, dist, i = null) => {
        // **Desde la `y` que se da, tal cual.** La cintura la suma `avanzar`
        // (`CINTURA`, manada.js) porque es su decisión, no del mundo: sumándola
        // aquí, el paseo —que traza desde el OJO, msmonsterserver.cpp:1084— se
        // llevaba una segunda cintura y miraba a 2,27 m del suelo.
        const o = { x, y, z };
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
        const delMundo = g ? y + 1.0 - g.timeOfImpact : null;
        // Y EL MONSTERCLIP TAMBIÉN ES SUELO para un bicho: `DROP_TO_FLOOR` y
        // `SV_movestep` sacan los dos su `monsterClip` de las banderas de la
        // entidad (pr_cmds.cpp:1696, sv_move.cpp:44). Un bloque puesto en una
        // cornisa no sólo impide pasar: se anda por encima. Gana el más alto.
        const deLaValla = this.valla?.techo(x, z, y + 1.0, 3) ?? null;
        if (deLaValla === null) return delMundo;
        if (delMundo === null) return deLaValla;
        return Math.max(delMundo, deLaValla);
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
            // CERO A PROPÓSITO, y no es que falte: `m_Width` sólo se asigna en
            // el `width` de un guion de NPC (npcscript.cpp:201) y el guion del
            // jugador no lo trae, así que de las dos mitades que `range` resta
            // sólo cuenta la del bicho (el 82). Poner aquí los 32 de su caja
            // daría 16 unidades de alcance que el motor no da.
            ancho: 0,
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
        // El ojo es el alto ENTERO (`view_ofs = m_Height`, msmonsterserver.cpp:250)
        // y no el 0,9 que había aquí, que era la proporción del JUGADOR. Ver
        // `ojoDe` en `src/play/manada.js`: el 81.
        const o = { x: n[0], y: n[1] + ojoDe(i) / U, z: n[2] };
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
      /**
       * EL RAYO DEL SERVIDOR PARA `setmovedest` Y `$cansee` — el 81.
       *
       * ── POR QUÉ HAY DOS RAYOS Y NO UNO ────────────────────────────────────
       *
       * Porque hay DOS MUNDOS de Rapier: el del navegador (`src/main.js`) y éste.
       * Tirar el rayo dos veces es inevitable, y fingir una copia única sería una
       * indirección que no corresponde a nada. Lo que sí está una sola vez es la
       * REGLA —`loVe` en `src/play/movedest.js`, el `FMVisible` de
       * combat.cpp:1216-1250—, y aquí sólo se le da el trazo de este mundo.
       *
       * *No son dos copias de una regla: son dos implementaciones de una medida
       * física en dos mundos distintos. La regla está en un sitio y éstas sólo le
       * contestan sí o no.*
       *
       * Y lo que faltaba sin esto no era «el rayo»: era que **`src/red/partida.js`
       * monta su propio `InteraccionesNpc`**, así que con servidor el gancho `irA`
       * seguía siendo el `=> {}` del 43 y `$cansee` contestaba «no» a todo — con
       * lo que cualquier bloque que empiece por `if $cansee(...)` se abandona
       * entero, porque es un `if` VIEJO (el 67). La costura del 63 con las dos
       * mitades verdes, y no la vio nada porque las sondas miden UN navegador.
       */
      trazarParaVer: (i) => (desde, dir, largo) => {
        const g = fisica.castRay(
          new RAPIER.Ray({ x: desde[0], y: desde[1], z: desde[2] },
            { x: dir[0], y: dir[1], z: dir[2] }),
          largo, true, undefined, undefined, undefined, mio(i),
        );
        return g ? (g.collider?.handle ?? null) : null;
      },
      /**
       * Dónde está el ojo, el centro y el casco de alguien, en UNIDADES.
       *
       * ── EL CUERPO DEL JUGADOR VIENE DE FUERA, Y NO ES UN DETALLE ──────────
       *
       * La primera versión resolvía al jugador con `this._jugadorDe(ref)`, y eso
       * **no puede funcionar**: `_jugadorDe` espera los identificadores internos
       * de la IA —`j3`, de `nombreDeJugador`, que parte la cadena y lee un
       * número— y la referencia que trae un guion es la del PERSONAJE. Habría
       * devuelto `null` siempre, o sea un `setmovedest PARAM1 9999` que no manda
       * a nadie y un `$cansee` que dice «no»: el mismo hueco callado que esto
       * venía a tapar, un nivel más abajo.
       *
       * Quien sabe a quién se le está hablando es `src/red/partida.js`
       * (`_aQuienHabla()`), así que el cuerpo se le pide a él y aquí no se
       * adivina. Sin cuerpo se devuelve `null` y el gancho lo APUNTA.
       */
      entidadDeGuion: (ref, suya, cuerpoDelJugador = null) => {
        const r = String(ref ?? "");
        if (!r) return null;
        // `ent_me` es el propio NPC: un bicho mandado a sí mismo ya está llegado.
        const q0 = r === "ent_me" ? suya : null;
        if (!q0 && cuerpoDelJugador) {
          const c = cuerpoDelJugador;
          const o = c.eye, p = c.feet;
          // El jugador CUENTA como monstruo (`class CBasePlayer : public
          // CMSMonster`, player.h:396) y su `m_Width` es 0, porque sólo se
          // asigna en el `setsize` de un guion de NPC (npcscript.cpp:201). Con
          // tamaño 0 el punto de superficie es exactamente el ojo.
          const alto = (c.perfil?.height ?? 1.8);
          return {
            ojo: [o[0] * U, o[1] * U, o[2] * U],
            centro: [p[0] * U, (p[1] + alto / 2) * U, p[2] * U],
            ancho: 0, alto: alto * U, vuela: false, esBicho: true,
            colisionador: c.collider?.handle ?? null,
          };
        }
        const q = q0 ?? this.manada?.porObjetivo?.(r) ?? null;
        if (!q) return null;
        const n = q.donde, alto = ojoDe(q);
        return {
          ojo: [n[0] * U, n[1] * U + alto, n[2] * U],
          centro: [n[0] * U, n[1] * U + alto / 2, n[2] * U],
          ancho: q.ficha?.ia?.ancho ?? q.ficha?.ancho ?? 0,
          alto, vuela: Boolean(q.ficha?.vuela), esBicho: true,
          colisionador: this.solidos?.puestos.find((p) => p.instancia === q)?.colisionador?.handle ?? null,
        };
      },
      /**
       * `UTIL_TraceLine(..., dont_ignore_monsters, ...)` con `flFraction == 1`,
       * que es lo que pide la huida de `setmovedest` (npcscript.cpp:1677).
       *
       * **No es el `libre` del paseo**: aquél traza sin monstruos, y aquí otro
       * bicho en medio SÍ tapa el rumbo — un jabalí acorralado por sus hermanos
       * no encuentra por dónde huir, y eso es lo que el mod hace.
       */
      libreConBichos: (i) => (aU, bU) => {
        const o = { x: aU[0] / U, y: aU[1] / U, z: aU[2] / U };
        const d = { x: bU[0] / U - o.x, y: bU[1] / U - o.y, z: bU[2] / U - o.z };
        const L = Math.hypot(d.x, d.y, d.z);
        if (!(L > 0)) return true;
        d.x /= L; d.y /= L; d.z /= L;
        return !fisica.castRay(new RAPIER.Ray(o, d), L, true,
          undefined, undefined, undefined, mio(i));
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
    // LAS APARICIONES van ANTES de pensar, y el orden no es indiferente: un bicho
    // que aparece en este paso tiene que poder ser visto y perseguido en el mismo
    // paso, igual que en el motor `SpawnMonsters` es un `think` como los demás.
    this._aparecer(dt);
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
   * Las áreas piensan, y lo que decidan se aplica al mundo.
   *
   * Aparecer es tres cosas y no una: quitarle el sueño, devolverlo a su sitio y
   * devolverle el cilindro. Si falta la tercera el bicho se ve y se atraviesa; si
   * falta la segunda aparece donde murió, que en el motor no pasa porque el
   * monstruo es nuevo y su origen es el de la ficha (`m_SpawnLoc` fijo).
   */
  _aparecer(dt) {
    // LAS MUERTES, primero. No se leen de `manada.sucesos` —de ahí tira el
    // protocolo y se vacía cuando le toca a él— sino del estado, con una marca por
    // bicho: así no se puede perder una muerte por un problema de orden, y
    // llamarlo dos veces no cuenta dos. El motor apunta `deathtime` en el momento
    // de morir, no cuando el cadáver se va (msmapents.cpp:986).
    for (const i of this.manada.instancias) {
      if (!i.muerto || i.avisadoAlArea) continue;
      i.avisadoAlArea = true;
      this.aparecedor.muerto(i.id);
    }
    // Y LOS CILINDROS, cuadrados contra el estado y **no leyendo `sucesos`**.
    //
    // Primero lo hice leyendo el suceso «sale» de la manada, y era un fallo de los
    // que no dan error: de `manada.sucesos` tira el protocolo y se vacía cuando hay
    // un cliente que lo consuma. Con la partida vacía nadie lo vacía, así que el
    // mismo «sale» se procesaba en cada paso y le quitaba el cilindro al bicho
    // justo después de que su área le devolviera el suyo. Un monstruo que vuelve y
    // se atraviesa, sólo cuando no mira nadie.
    //
    // Cuadrar contra `dormido` no se puede desincronizar y llamarlo dos veces no
    // hace nada. `conCilindro` es la marca, para no barrer la lista entera.
    for (const i of this.manada.instancias) {
      // El invariante, escrito como invariante y no al reves: **tiene cilindro si y
      // solo si esta en el mundo**. La primera version decia
      // `if (i.dormido === i.conCilindro) continue`, que salta exactamente los dos
      // casos que hay que arreglar. En el servidor no se noto porque al aparecer se
      // llamaba a `poner` aparte, asi que el bucle era codigo muerto; en el
      // navegador no habia esa segunda llamada y quedaron 69 bichos en el mundo con
      // 31 cilindros — visibles, atravesables, y sin un error en consola. Lo cazo
      // un control nuevo de `sonda:arco` que compara las dos cuentas.
      const debeTenerlo = !i.dormido;
      if (i.conCilindro === debeTenerlo) continue;
      if (debeTenerlo) i.conCilindro = Boolean(this.solidos?.poner(i));
      else { this.solidos?.quitar(i); i.conCilindro = false; }
    }
    for (const s of this.aparecedor.tic(dt)) {
      if (s.que === "aparece") {
        const i = this.manada.de(s.id);
        if (!i) continue;
        this.manada.revivir(i);
        i.dormido = false;
        i.avisadoAlArea = false;
        // El cilindro NO se pone aqui: lo cuadra el bucle de arriba en el paso
        // siguiente, y tenerlo en un solo sitio es lo que hace que el navegador y
        // el servidor no puedan divergir.
        this.manada.sucesos.push({ que: "aparece", id: s.id });
      } else if (s.que === "seAcaban") {
        // `fireallperish`. En Gate City es `spawn_bowguys` abriendo
        // `skele_treasure`: el cofre sale cuando mueren los tres ballesteros.
        this._fireTargets(s.dispara);
        this.manada.sucesos.push({ que: "seAcaban", area: s.area, dispara: s.dispara });
      } else if (s.que === "perece") {
        // `perishtarget` (el 68): se ha gastado la ÚLTIMA vida de UNA ficha. En
        // Edana es la primera oleada de jabalíes llamando a `wave2`.
        this._fireTargets(s.dispara);
        this.manada.sucesos.push({ que: "perece", id: s.id, nombre: s.nombre, dispara: s.dispara });
      }
    }
  }

  /**
   * SE HA MUERTO UNO: se le dice a su área.
   *
   * El motor cuenta desde `deathtime`, que es el instante de la muerte y **no** el
   * del cadáver: la espera de vuelta corre mientras el cuerpo se desvanece. Al
   * bicho se le deja dormido en cuanto el cadáver acaba de desvanecerse, que es
   * cuando el motor ya lo ha borrado.
   */
  avisarMuerte(id) {
    // El `killtarget` DEL MONSTRUO (el 68): no mata, dispara
    // (msmonsterserver.cpp:2568-2569). Mismo arreglo que en
    // `src/render/bichos.js`; aquí cuelga de `avisarMuerte` porque es este el
    // único sitio del servidor por donde pasa una muerte una sola vez.
    const alMorir = this.manada.de(id)?.ficha?.alMorir;
    if (alMorir) this._fireTargets(alMorir);
    return this.aparecedor.muerto(id);
  }

  /**
   * `FireTargets` desde el aparecedor (el 68): a las áreas Y al mapa.
   *
   * Los DOS, y no uno u otro, porque `FireTargets` busca por `targetname` en todo
   * el mundo y no sabe de familias. Un nombre puede ser de un área, de una ficha,
   * de un `trigger_relay`, o de varias cosas a la vez — `FIND_ENTITY_BY_TARGETNAME`
   * recorre la lista entera y usa todas las que encuentra.
   */
  _fireTargets(nombre) {
    if (!nombre) return;
    this.aparecedor.disparar(nombre);
    this.disparar?.(nombre);
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
