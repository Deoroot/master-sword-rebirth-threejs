// LO QUE UN GUION CREA CON `createnpc`, Y CÓMO VIVE DESPUÉS.
//
//     createnpc <script_name> <origin> [params...]        scriptcmds.cpp:2760-2816
//
// 357 usos en 181 guiones del mod: las invocaciones de las armas y de los
// hechizos, las crías de un jefe, las oleadas de `game_master`, las trampas.
// Lo que hace el motor, entero y en este orden (:2766-2816):
//
//   1. `Params.size() >= 2`, o `ERROR_MISSING_PARMS`. Sólo en el servidor
//      (`#ifdef VALVE_DLL`).
//   2. `CREATE_NAMED_ENTITY("ms_npc")`: un `CMSMonster` como cualquier otro del
//      mapa —la MISMA clase que un goblin colocado (msmonsterserver.cpp:38-59)—.
//   3. `pev->origin = StringToVec(Params[1])`: nace EN ese punto, sin
//      `DROP_TO_FLOOR` ni comprobación de hueco.
//   4. `Spawn(Params[0])`: carga el guion y corre `spawn` y `game_spawn`
//      (global.cpp:435-437).
//   5. `StoreEntity(creador, ENT_CREATIONOWNER)` en lo creado y
//      `StoreEntity(creado, ENT_LASTCREATED)` en el creador: es lo que el
//      creador lee después con `$get(ent_lastcreated,id)`.
//   6. `CallScriptEvent("game_dynamically_created", Params[2..])`: todo lo que
//      va detrás del origen llega al guion nuevo como PARAM1, PARAM2…
//
// No devuelve nada: `ent_lastcreated` es la única vuelta. Y no hay ningún
// «cuando acabe»: lo creado decide solo cuándo irse (`deleteent ent_me`) y a
// quién avisar (`callexternal <asa> <evento>`), con las asas que le pasaron
// como parámetro. Así sabe la Blood Drinker cuándo volver: le pasa su propia
// asa (`$get(ent_me,id)`, PARAM5) y la invocación le llama `sword_return`
// (monsters/summon/blood_drinker.script:303-312).
//
// ── POR DÓNDE ENTRA EN ESTE PUERTO ──────────────────────────────────────────
//
// Por la MANADA, que es por donde entran todos los bichos: `Manada.crear` hace
// con la ficha horneada lo mismo que el constructor con las del mapa, y
// `src/render/bichos.js` le cuelga su nodo. Lo creado es una instancia más: se
// anima, se dibuja y —si su ficha es de combate— caza, pega y muere por el
// camino de siempre, con su guion bajo el cierre del 91.
//
// Lo que NO es de combate —una invocación— se mueve sola desde su guion, y eso
// es lo que añade este archivo: el vuelo (`fly`, `setmovedest`,
// `setanim.movespeed`, `setvelocity`), el toque (`setcallback touch`,
// `game_touch`) y poder hablar de OTRAS entidades por su asa, que el entorno de
// un NPC no sabía (`npcguion.js`: «aquí sólo hay dos entidades, el jugador y
// el NPC»).
//
// Sin DOM, sin Three y sin Rapier: lo que es del mundo —la traza, el daño, dónde
// está el jugador— entra inyectado, y por eso se prueba en Node.
//
// ── LO QUE NO HACE, DICHO AQUÍ ──────────────────────────────────────────────
//
//   - CON SERVIDOR NO CORRE. La manada del servidor no crea instancias y el
//     protocolo manda los bichos por índice (`src/red/`). `main.js` no llama a
//     esto con red; el `createnpc` se apunta.
//   - El avance de `Move` (`setanim.movespeed`) NO choca con el mundo: el motor
//     usa `MoveExecute`, que para en una pared. La velocidad (`setvelocity`) sí
//     se para en el mundo, pero no DESLIZA: `SV_Physics_Toss` recorta la
//     velocidad contra el plano (ReHLDS sv_phys.cpp:1165-1196) y aquí se pone
//     a cero. Y la traza es un punto, no la caja.
//   - `game_touch` se mira en cada paso por solape de cajas, y sólo contra
//     bichos. El motor lo dispara al enlazar cada monstruo que corre su física
//     (`SV_TouchLinks`, ReHLDS world.cpp:322), o sea también una vez por
//     fotograma y por bicho que solape; lo que no se copia es que allí la caja
//     enlazada lleva una unidad de margen. El guion de la Blood Drinker se
//     limita solo a un toque cada 0,1 s (`NEXT_TOUCH`, :93-95). El toque con el
//     JUGADOR no se manda: en ese guion no hace nada (no es enemigo de sí
//     mismo y la rama de curar sale por `isplayer`, :103-110).
//   - `effect glow`, `effect beam` y `setprop … rendermode`: no hay brillo ni
//     rayo. Llegan al gancho de siempre, que los rechaza y los apunta.
//   - `invincible`, `blood`, `setsolid`, `setmonsterclip`, `takedmg`: se
//     apuntan. Una invocación sin `hp` no entra en la lista de golpeables
//     (`Manada.vivos` pide `vida > 0`), que es lo que `invincible` conseguiría.
//
// ── LO QUE LA BLOOD DRINKER HACE DE VERDAD, QUE NO ES LO QUE SU GUION QUIERE ─
//
// Su guion avanza con `vectoradd MY_ORG $relvel(0,FWD_SPEED,0)` y `setorigin
// ent_me MY_ORG` cada 0,1 s (blood_drinker.script:137-142), y `FWD_SPEED` es un
// `setvard`. Pero `$relvel` con UN parámetro no lee sus parámetros resueltos:
// lee el TEXTO de detrás del nombre (`StringToVec(&FullName.c_str()[7])`,
// script.cpp:3614), y `sscanf("(0,FWD_SPEED,0)", "(%f,%f,%f)")` no casa: da
// (0,0,0) (sharedutil.cpp:115-124). Sólo un `const` funciona ahí, porque se
// sustituye al CARGAR (`GetConst`, script.cpp:325-345); por eso el resto del
// mod escribe `$relvel($vec(0,YAW,0),$vec(0,VEL,0))` cuando la cifra es una
// variable (819 veces, contra 86 de la otra forma).
//
// O sea que con un objetivo vivo la espada NO vuela hacia él: se queda donde
// nació —el centro de su dueño—, girando, y se arrastra a 1 u/s
// (`NPC_HACKED_MOVE_SPEED 1`). Pega a lo que se meta en su caja de 64 unidades
// y vuelve cuando acaba su duración si el dueño sigue a menos de 72 unidades.
// El propio guion lo dice arriba: «Want this to move from target to target but
// may need to simply make a projectile». Sin objetivo vivo sí se mueve, por la
// otra rama: `setvelocity` a 100 u/s hacia un punto delante del dueño (:145-150).
//
// Se porta así, con el fallo (CLAUDE.md §3). NO está medido contra el juego:
// si allí vuela, es que el binario no es este fuente.

import { textoDeVector, PROPIEDADES } from "./guion.js";
import { RELACION, relacionDeRazas, RAZA_DEL_JUGADOR } from "../bsp/razas.js";

/**
 * LAS ARMAS CUYO ATAQUE CORRE POR SU GUION VIVO, porque crea algo.
 *
 * En el motor TODO ataque llama a `<retorno>_start` y `<retorno>_strike` del
 * guion del arma (giattack.cpp:345 y :877). Aquí los ataques están horneados
 * (`tools/armas.mjs`) y esos eventos no corren, salvo para las armas de esta
 * lista: en ellas el `_strike` es quien hace el `createnpc`, y sin correrlo no
 * hay invocación.
 *
 * Es una lista y no «toda arma con `createnpc`» (son 37 de las 209) porque lo
 * que cada `_strike` le pide al motor es distinto y hay que medirlo: los
 * tomahawks leen PARAM2 —el final de la traza del golpe— para saber adónde
 * volar (items/axes_td.script:107-121), y este puerto no se lo da. Encender
 * una sin medirla es tirar un hacha al origen del mapa.
 */
export const ARMAS_QUE_INVOCAN = new Set(["swords_blood_drinker"]);

/** `pev->nextthink = gpGlobals->time + 0.1` (msmonsterserver.cpp:511). */
export const PERIODO_THINK = 0.1;
/** La caja de un jugador de pie: `maxs.z - mins.z` = 72 (`$get(,height)`, scriptcmds.cpp:1037). */
export const ALTO_DEL_JUGADOR = 72;
/** El `origin` de un jugador es el centro de su caja: 36 sobre los pies (msitemdefs.h:55). */
const CENTRO_DEL_JUGADOR = 36;

/** De la escena (metros, Y arriba, Z = −Y del motor) al motor (unidades, Z arriba). */
export const aMotor = (p, U) => [p[0] * U + 0, -p[2] * U + 0, p[1] * U + 0];
/** Y la vuelta. */
export const aEscena = (v, U) => [v[0] / U + 0, v[2] / U + 0, -v[1] / U + 0];

/**
 * `UTIL_VecToAngles` — [pitch, yaw, 0] en grados, los dos en [0, 360)
 * (ReHLDS, engine/mathlib.cpp:155-180, `VectorAngles`): el cabeceo es POSITIVO
 * hacia arriba, al revés que el de `AngleVectors`, y por eso el motor lo niega
 * al copiarlo a `v_angle` (msmonsterserver.cpp:1021 y :1181).
 */
export function angulosDe(v) {
  const [x, y, z] = v;
  if (x === 0 && y === 0) return [z > 0 ? 90 : 270, 0, 0];
  let yaw = (Math.atan2(y, x) * 180) / Math.PI;
  if (yaw < 0) yaw += 360;
  let pitch = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  if (pitch < 0) pitch += 360;
  return [pitch, yaw, 0];
}

/** `AngleVectors`, sólo el vector de frente: (cp·cy, cp·sy, −sp). */
export function frenteDe(ang) {
  const p = (ang[0] * Math.PI) / 180, y = (ang[1] * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)];
}

/**
 * Lo que dice `$get(<x>,relationship,<y>)` — scriptcmds.cpp:1392-1417. El
 * MIEDO también es «enemy» (`RELATIONSHIP_FR`), y el recelo es «wary».
 */
export function nombreDeRelacion(r) {
  switch (r) {
    case RELACION.ALIADO: return "ally";
    case RELACION.RECELO: return "wary";
    case RELACION.MIEDO: case RELACION.DESPRECIO: case RELACION.ODIO: case RELACION.NEMESIS: return "enemy";
    default: return "neutral";
  }
}

/** Lo que `$get_tsphere(enemy,…)` cuenta como enemigo: −3, −4 y −5 (script.cpp:2884-2903). */
const esEnemigoDeEsfera = (r) => r === RELACION.DESPRECIO || r === RELACION.ODIO || r === RELACION.NEMESIS;

const anchoDe = (i) => Number(i?.ficha?.ia?.ancho ?? i?.ficha?.ancho ?? 0) || 0;
const altoDe = (i) => Number(i?.ficha?.ia?.alto ?? i?.ficha?.alto ?? 0) || 0;
/** `IsAlive()` de un `CMSMonster`: `deadflag == DEAD_NO` (msmonster.h:357). No mira la vida. */
const estaVivo = (i) => Boolean(i) && !i.muerto && !i.dormido;
const sinComillas = (s) => String(s ?? "").replace(/^["']|["']$/g, "");

export class MundoDeCreados {
  /**
   * @param fichaDe        `(script) => ficha | null`: la ficha HORNEADA de lo que se puede crear.
   * @param crearInstancia `(ficha, dondeMetros) => instancia`: `Manada.crear`, con su nodo si hay dibujo.
   * @param guionDe        `(instancia) => GuionDeNpc | null`: `InteraccionesNpc.guionDe`.
   * @param guionSiHay     `(instancia) => GuionDeNpc | null`: el que ya exista, sin crearlo.
   * @param entidades      el registro de asas (`src/play/entidades.js`), el de la partida.
   * @param instancias     `() => instancia[]`: la manada entera.
   * @param razas          `() => Map | null`: la tabla de `races.script` horneada.
   * @param jugador        `() => { ref, personaje, pies:[m,m,m], yaw:grados } | null`.
   * @param herir          `(instancia, dano, { habilidad, tipo, de }) => any`: el daño del jugador a un bicho.
   * @param curar          `(que, cantidad) => void`: `givehp`/`givemp` al jugador.
   * @param trazar         `(desdeMotor, hastaMotor) => puntoMotor | null`: el mundo, sin monstruos.
   * @param objeto         `(asa) => { llamar(evento, params) } | null`: un objeto con guion (el arma).
   * @param alCrear, alBorrar  `(instancia) => void`: para quien lleve cilindros o cuentas.
   */
  constructor({
    fichaDe = null, crearInstancia = null, guionDe = null, guionSiHay = null, retirarGuion = null,
    entidades = null, instancias = () => [], razas = () => null, jugador = () => null,
    herir = null, curar = null, trazar = null, objeto = null,
    alCrear = null, alBorrar = null,
    unidadesPorMetro = 39.37, ahora = () => 0, azar = Math.random,
  } = {}) {
    Object.assign(this, {
      fichaDe, crearInstancia, guionDe, guionSiHay, retirarGuion, entidades, instancias, razas, jugador,
      herir, curar, trazar, objeto, alCrear, alBorrar, ahora, azar,
    });
    this.U = unidadesPorMetro;
    /** Las instancias creadas que siguen en el mundo. */
    this.vivos = [];
    this._acumulado = 0;
    /**
     * Lo que ha pasado, para medirlo desde fuera sin recalcular nada (el 65):
     * `creados` y `borrados` son entidades; `sinFicha` los `createnpc` de un
     * guion que no está horneado, con su nombre en `faltan`; `toques` los
     * `game_touch` entregados y `danos` los golpes que llegaron a un bicho.
     */
    this.cuenta = { creados: 0, borrados: 0, sinFicha: 0, sinManada: 0, toques: 0, danos: 0, llegadas: 0, pensados: 0 };
    this.faltan = [];
  }

  // ── asas ──────────────────────────────────────────────────────────────────

  /**
   * El asa de una instancia de la manada: `EntToString`, «PentP(i,d)».
   *
   * Los bichos del mapa no tenían asa salvo los que llevan `name_unique` (el
   * 81). Se les da una la primera vez que un guion tiene que nombrarlos, en el
   * MISMO registro de la partida —para que `callexternal` y `deleteent` la
   * resuelvan— y con un nombre que empieza por `#`, que `$get_by_name` no puede
   * pedir: ningún guion busca una entidad llamada así.
   */
  asaDe(i) {
    if (!i || !this.entidades) return "0";
    if (i.asa && this.entidades.recuperar(i.asa)?.que === i) return i.asa;
    const e = this.entidades.registrar(`#bicho ${i.id}`, i);
    i.asa = `PentP(${e.indice},${e.direccion})`;
    return i.asa;
  }

  /** El asa de un objeto con guion (el arma que crea), para que le llamen de vuelta. */
  asaDeObjeto(objeto) {
    if (!objeto || !this.entidades) return "0";
    if (objeto.asa && this.entidades.recuperar(objeto.asa)?.que?.objeto === objeto) return objeto.asa;
    const e = this.entidades.registrar(`#objeto ${objeto.id ?? ""}`, { objeto });
    objeto.asa = `PentP(${e.indice},${e.direccion})`;
    return objeto.asa;
  }

  /** `RetrieveEntity(ref)` visto desde el guion de `yo`: quién es. */
  _ent(ref, yo) {
    const r = String(ref ?? "");
    if (r === "ent_me") return { que: "bicho", i: yo, yo: true };
    if (r === "ent_creationowner") return yo?.creado?.creador ? this._ent(yo.creado.creador, yo) : null;
    const j = this.jugador?.() ?? null;
    if (j && (r === j.ref || r === "player")) return { que: "jugador", j };
    const e = this.entidades?.recuperar(r) ?? null;
    if (!e?.que) return null;
    if (e.que.objeto) return { que: "objeto", objeto: e.que.objeto };
    if (e.que.ficha) return { que: "bicho", i: e.que, yo: e.que === yo };
    return null;
  }

  /** `pev->origin` en unidades del motor: los pies de un monstruo, el centro de un jugador. */
  origenDe(ent) {
    if (!ent) return null;
    if (ent.que === "bicho") return aMotor(ent.i.donde, this.U);
    if (ent.que === "jugador") {
      const m = aMotor(ent.j.pies, this.U);
      m[2] += CENTRO_DEL_JUGADOR;
      return m;
    }
    return null;
  }

  /** `IRelationship`: la relación de la raza de `i` hacia `raza`. */
  _relacion(i, raza) {
    const mia = i.raza ?? i.ficha?.ia?.raza ?? null;
    const tabla = this.razas?.() ?? null;
    if (tabla && mia) return relacionDeRazas(tabla, mia, raza);
    // Sin tabla, la única relación horneada es contra el jugador (`human`).
    if (String(raza).toLowerCase() === RAZA_DEL_JUGADOR && Number.isFinite(i.ficha?.relacion)) return i.ficha.relacion;
    return RELACION.SIN_RAZA;
  }

  _razaDe(ent) {
    if (!ent) return "";
    if (ent.que === "jugador") return RAZA_DEL_JUGADOR;
    if (ent.que === "bicho") return String(ent.i.raza ?? ent.i.ficha?.ia?.raza ?? "");
    return "";
  }

  // ── crear ─────────────────────────────────────────────────────────────────

  /**
   * `createnpc`. Devuelve el asa de lo creado, o `null` si no se pudo.
   *
   * `creador` es el asa de quien lo pide (`ENT_CREATIONOWNER`), o `null`.
   */
  crear(script, origenMotor, params = [], { creador = null } = {}) {
    const ruta = String(script ?? "").replace(/\.script$/i, "");
    const ficha = this.fichaDe?.(ruta) ?? null;
    if (!ficha) {
      // «Any media used by createnpc must be precached beforehand»
      // (scriptcmds.cpp:2765): aquí, horneado. Se dice cuál falta.
      this.cuenta.sinFicha++;
      if (!this.faltan.includes(ruta)) this.faltan.push(ruta);
      return null;
    }
    if (!this.crearInstancia) { this.cuenta.sinManada++; return null; }
    const donde = aEscena(origenMotor ?? [0, 0, 0], this.U);
    const i = this.crearInstancia(ficha, donde);
    if (!i) { this.cuenta.sinManada++; return null; }
    i.creado = {
      mundo: this, script: ruta, creador, params: [...params],
      // Lo que su guion vaya encendiendo: ver `ampliar`.
      tocar: false, raza: null,
    };
    /**
     * EL VUELO, que es de `CMSMonster::SetMoveDest` y `Move`
     * (msmonsterserver.cpp:994-1052 y :1162-1240). `destino` y `proximidad`
     * son `m_MoveDest`; `vAngulos` es `pev->v_angle`, lo que `$relvel` lee de
     * un bicho que vuela (script.cpp:3613); `suelo` es `m_flGroundSpeed` y
     * `vel` `pev->velocity`. `vuela` lo pone `fly 1` en su `game_spawn`.
     */
    i.vuelo = { vuela: false, conDestino: false, destino: null, proximidad: 0, vAngulos: [0, 0, 0], suelo: 0, vel: null };
    const asa = this.asaDe(i);
    this.vivos.push(i);
    this.cuenta.creados++;
    // El guion: `spawn` y `game_spawn` corren dentro (el constructor de
    // `GuionDeNpc`), con `ampliar` ya puesto.
    const g = this.guionDe?.(i) ?? null;
    if (g) {
      // `game.time`: sin reloj vale 0,00 y `if game.time > NEXT_TOUCH` no se
      // cumple nunca (blood_drinker.script:93).
      if (g.guion) g.guion.ahora = () => this.ahora();
      if (!esDeCombate(i)) g.alHacerDano = (d) => this._dano(i, d);
      // Si su guion tiene el evento o no, se apunta: `CallScriptEvent` sobre
      // un nombre que no existe no hace nada y no avisa.
      i.creado.recibio = Boolean(g.guion?.llamar("game_dynamically_created", params.map(String)));
    }
    this.alCrear?.(i);
    return asa;
  }

  /**
   * LO QUE CUALQUIER NPC NECESITA PARA CREAR: el gancho de `createnpc` y poder
   * hablarle a quien le creó a él (`ent_creationowner`, `ENT_CREATIONOWNER`,
   * scriptcmds.cpp:2796). Lo pone `InteraccionesNpc.guionDe` en el guion de
   * todos los NPC del mapa y de los monstruos creados.
   *
   * LO QUE NO ARREGLA, y va dicho: `$get(ent_me,id)` de un NPC sigue valiendo
   * «0» en este puerto (npcguion.js, `propiedad`), así que un guion del mapa
   * que le pase SU asa a lo que crea le pasa «0». Lo creado llega a su creador
   * por `ent_creationowner`. Darle asa a todo NPC cambia lo que ven todos los
   * guiones del juego y pide sus propias medidas.
   */
  darCrear(entorno, g, i) {
    const m = this;
    entorno.crearNpc = (script, origen, params) => m.crear(script, origen, params, { creador: m.asaDe(i) });
    const base = entorno.llamarExterno;
    entorno.llamarExterno = (ref, nombre, params = []) =>
      base?.(String(ref) === "ent_creationowner" && i.creado?.creador ? i.creado.creador : ref, nombre, params);
  }

  /**
   * LO QUE UNA INVOCACIÓN LE AÑADE AL ENTORNO DE UN NPC. Lo llama `GuionDeNpc`
   * antes de correr ningún evento (por `InteraccionesNpc.guionDe`), y sólo para
   * lo creado que NO es de combate: un monstruo creado por guion es un monstruo
   * y vive como los del mapa.
   */
  ampliar(entorno, g, i) {
    const m = this;
    const v = i.vuelo;
    const apuntar = (tipo, nombre) => g?.guion?.anotarNoSoportado(tipo, nombre);
    const j = this.jugador?.() ?? null;
    // El jugador de este guion es el de la partida: lo que una invocación
    // recibe en PARAM1 es su asa, y el entorno tiene que reconocerla.
    if (j && g) g.jugador = { personaje: j.personaje ?? null, ref: j.ref };
    entorno.propiedadesPropias ??= new Set();
    for (const p of ["height", "angles.yaw", "relationship", "scriptvar"]) entorno.propiedadesPropias.add(p);

    const base = {
      propiedad: entorno.propiedad, dar: entorno.dar, llamarExterno: entorno.llamarExterno,
      borrarEntidad: entorno.borrarEntidad,
      // Lo que NO vuela (un cofre, un vecino creado por guion) anda y cae como
      // cualquier NPC: por los ganchos de siempre, los de la manada.
      irA: entorno.irA, velocidad: entorno.velocidad,
    };
    const f2 = (x) => Math.fround(Number(x) || 0).toFixed(2);       // `RETURN_FLOAT`, «%.2f»

    entorno.propiedad = (ref, prop, resto = []) => {
      const p = String(prop);
      const ent = m._ent(ref, i);
      // Una referencia que no es nadie: «0» (script.cpp:1196-1199). El entorno
      // de base contestaría con los datos del propio NPC a cualquier asa que no
      // sea el jugador, y `$get(0,isalive)` de un objetivo que no hay sería «1».
      if (!ent) return "0";
      if (ent.que === "objeto") return p === "id" || p === "exists" ? (p === "id" ? String(ref) : "1") : "0";
      if (ent.que === "jugador") {
        if (p === "height") return f2(ALTO_DEL_JUGADOR);
        // `RETURN_ANGLE("angles", pev->angles)` -> `.yaw` (iscript.h:250-260).
        if (p === "angles.yaw") return f2(ent.j.yaw ?? 0);
        if (p === "scriptvar") return String(resto[0] ?? "");
        if (p === "relationship") return "neutral";
        if (p === "isalive" || p === "alive") return ent.j.vivo === false ? "0" : base.propiedad(ent.j.ref, p, resto);
        return base.propiedad(ent.j.ref, p, resto);
      }
      const x = ent.i;
      switch (p) {
        case "exists": return "1";
        case "isplayer": return "0";
        case "id": return ent.yo ? m.asaDe(x) : String(ref);
        case "alive": case "isalive": return estaVivo(x) ? "1" : "0";
        case "name": return String(x.ficha?.nombre ?? "0");
        case "origin": return textoDeVector(aMotor(x.donde, m.U));
        // `pev->maxs.z - pev->mins.z` (scriptcmds.cpp:1037): el `height` del guion.
        case "height": return f2(altoDe(x));
        case "angles.yaw": return f2(((((x.yaw ?? 0) * 180) / Math.PI) % 360 + 360) % 360);
        case "hp": return String(x.vida ?? 0);
        case "maxhp": return String(x.vidaMaxima ?? 0);
        case "race": return m._razaDe(ent).toLowerCase() || "0";
        // `pMonster->IRelationship(pOtherEntity)` (scriptcmds.cpp:1392-1417):
        // la relación de `x` HACIA el otro, por la tabla de razas.
        case "relationship": {
          const otro = m._ent(resto[0], i);
          if (!otro) return "neutral";
          return nombreDeRelacion(m._relacion(x, m._razaDe(otro)));
        }
        // `GetFirstScriptVar` (script.cpp:5949-5955): la variable del guion del
        // otro, o EL NOMBRE tal cual si no la tiene.
        case "scriptvar": {
          const nombre = sinComillas(resto[0]);
          const suyo = ent.yo ? g : (m.guionSiHay?.(x) ?? null);
          const val = suyo?.guion?.vars?.get?.(nombre);
          return val === undefined || val === null ? String(resto[0] ?? "") : String(val);
        }
        // `dist`/`range`: entre los dos `origin`, menos media anchura de cada
        // uno si los dos son monstruos (scriptcmds.cpp:1146-1160).
        case "dist": case "range": case "dist2D": case "range2D": {
          const a = aMotor(x.donde, m.U), b = aMotor(i.donde, m.U);
          const plano = p.endsWith("2D");
          let d = Math.hypot(a[0] - b[0], a[1] - b[1], plano ? 0 : a[2] - b[2]);
          if (!plano) d -= (anchoDe(x) + anchoDe(i)) / 2;
          return f2(d);
        }
        default: return ent.yo ? base.propiedad(ref, p, resto) : "0";
      }
    };

    // `game.monster.<prop>` es `$get(ent_me,<prop>)` (script.cpp:4692-4700).
    // Sólo las que este entorno sabe contestar, como hasta ahora: el resto
    // sigue valiendo su propio nombre (ver `resolver`, guion.js).
    entorno.propiedadDeMi = (prop) => (PROPIEDADES.has(prop) || entorno.propiedadesPropias.has(prop)
      ? entorno.propiedad("ent_me", prop, []) : null);
    entorno.origenDeMi = () => aMotor(i.donde, m.U);
    // `$relvel` lee `v_angle` de lo que vuela y `angles` de lo demás (script.cpp:3613).
    entorno.angulosDeMi = () => (v.vuela ? [...v.vAngulos] : [0, ((((i.yaw ?? 0) * 180) / Math.PI) % 360 + 360) % 360, 0]);

    // ── el cuerpo ───────────────────────────────────────────────────────────
    entorno.volar = (si) => { v.vuela = Boolean(si); };
    entorno.velocidadDeSuelo = (x) => { v.suelo = Number(x) || 0; };
    entorno.retrollamada = (tipo, si) => {
      if (String(tipo).includes("touch")) i.creado.tocar = Boolean(si);
      else apuntar("comando", `setcallback ${tipo}`);
    };
    entorno.ponerRaza = (r) => { i.raza = String(r); };
    entorno.ponerOrigen = (ref, vec) => {
      const ent = m._ent(ref, i);
      if (!ent?.yo) { apuntar("comando", `setorigin ${ref} (sólo ent_me)`); return; }
      i.donde = aEscena(vec, m.U);
    };
    // `setvelocity`: `if (!pEntity->IsAlive()) abort_push` (scriptcmds.cpp:7203).
    entorno.velocidad = (ref, vec, { sumar = false } = {}) => {
      if (!v.vuela) return base.velocidad?.(ref, vec, { sumar });
      const ent = m._ent(ref, i);
      if (!ent?.yo) { apuntar("comando", `setvelocity ${ref} (sólo ent_me)`); return; }
      if (!estaVivo(i)) return;
      const a = [Number(vec?.[0]) || 0, Number(vec?.[1]) || 0, Number(vec?.[2]) || 0];
      v.vel = sumar && v.vel ? v.vel.map((x, k) => x + a[k]) : a;
    };
    /**
     * `setmovedest` — npcscript.cpp:1600-1660. Un vector va tal cual; una
     * entidad, a su OJO y, si es un monstruo, parado en su superficie
     * (`EyePosition() + vRay.Normalize() * Size`, :1651-1657). El destino se
     * calcula UNA vez, aquí: el motor no sigue a la entidad después.
     */
    entorno.irA = (destino, opciones = {}) => {
      if (!v.vuela) return base.irA?.(destino, opciones);
      const { proximidad = 0 } = opciones;
      if (destino === null) { m._parar(i, g); return; }
      let punto = null;
      if (destino.punto !== undefined) {
        const n = String(destino.punto).replace(/[()]/g, "").split(/[\s,]+/).filter(Boolean).map(Number);
        punto = [n[0] || 0, n[1] || 0, n[2] || 0];                // `StringToVec`
      } else {
        const ent = m._ent(destino.entidad, i);
        if (!ent || ent.que === "objeto") return;                 // `if (pEntity)`: sin entidad no hace nada
        const o = m.origenDe(ent);
        if (ent.que === "jugador") {
          // El ojo de un jugador: 28 sobre su centro (`VEC_VIEW`, hl/util.h), 64 sobre los pies.
          punto = [o[0], o[1], o[2] + 28];
        } else {
          const suOjo = [o[0], o[1], o[2] + altoDe(ent.i)];
          const mio = aMotor(i.donde, m.U);
          const miOjo = [mio[0], mio[1], mio[2] + altoDe(i)];
          const vuelaEl = Boolean(ent.i.vuelo?.vuela);
          const tam = vuelaEl ? Math.hypot(anchoDe(ent.i) / 2, altoDe(ent.i) / 2) : anchoDe(ent.i) / 2;
          const r = [miOjo[0] - suOjo[0], miOjo[1] - suOjo[1], miOjo[2] - suOjo[2]];
          const L = Math.hypot(r[0], r[1], r[2]);
          const u = L === 0 ? [0, 0, 1] : [r[0] / L, r[1] / L, r[2] / L];
          punto = [suOjo[0] + u[0] * tam, suOjo[1] + u[1] * tam, suOjo[2] + u[2] * tam];
        }
      }
      v.destino = punto;
      v.proximidad = Number(proximidad) || 0;
      v.conDestino = true;
    };

    // ── el mundo ────────────────────────────────────────────────────────────
    /**
     * `$get_tsphere` (script.cpp:2816-2928): los `CMSMonster` VIVOS dentro del
     * radio, sin contarse a sí mismo. `enemy` mira la relación del OTRO hacia
     * el que pregunta (`pMonster->IRelationship(m.pScriptedEnt)`) y pide que
     * tenga raza. Las formas `player` y `ally` con el jugador dentro no se
     * devuelven: aquí sólo se recorre la manada, y se apunta.
     */
    entorno.enEsfera = (tipo, radio, centro) => {
      const t = String(tipo).toLowerCase();
      const c = centro ?? aMotor(i.donde, m.U);
      const miRaza = m._razaDe({ que: "bicho", i });
      if (t === "player" || t === "ally") apuntar("getter", `$get_tsphere(${t}) sin el jugador`);
      const fuera = [];
      for (const x of m.instancias?.() ?? []) {
        if (x === i || !estaVivo(x)) continue;
        const o = aMotor(x.donde, m.U);
        if (Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > radio) continue;
        const rel = m._relacion(x, miRaza);
        const tieneRaza = Boolean(x.raza ?? x.ficha?.ia?.raza);
        if (t === "monster" || t === "any"
          || (t === "enemy" && tieneRaza && esEnemigoDeEsfera(rel))
          || (t === "ally" && tieneRaza && rel === RELACION.ALIADO)) fuera.push(m.asaDe(x));
      }
      return fuera;
    };
    entorno.trazar = (desde, hasta) => (m.trazar ? m.trazar(desde, hasta) : null);
    // Lo creado puede crear (una invocación que deja una nube).
    entorno.crearNpc = (script, origen, params) => m.crear(script, origen, params, { creador: m.asaDe(i) });

    // `givehp <jugador> <n>`: el robo de vida (blood_drinker.script:117).
    entorno.dar = (que, ref, cantidad) => {
      const ent = ref === null || ref === undefined ? { que: "bicho", yo: true } : m._ent(ref, i);
      if (ent?.que === "jugador") {
        if (!m.curar) { apuntar(que === "vida" ? "givehp" : "givemp", "al jugador, sin gancho"); return; }
        m.curar(que, Number(cantidad) || 0);
        return;
      }
      base.dar?.(que, ent?.yo ? null : ref, cantidad);
    };

    // `callexternal <asa> <evento>`: a un objeto con guion (el arma que la
    // lanzó, `sword_return`), y lo demás como siempre.
    entorno.llamarExterno = (ref, nombre, params = []) => {
      const ent = m._ent(ref, i);
      if (ent?.que === "objeto") {
        const dicho = Boolean(ent.objeto.llamar?.(String(nombre), params.map(String)));
        if (!dicho) apuntar("callexternal", `${ref} ${nombre}`);
        return;
      }
      // A otro bicho, por su asa de verdad: `ent_creationowner` y compañía no
      // son un asa para el entorno de base.
      base.llamarExterno?.(ent?.que === "bicho" && !ent.yo ? m.asaDe(ent.i) : ref, nombre, params);
    };

    /**
     * `deleteent ent_me` — scriptcmds.cpp:2886-2913. Sin segundo parámetro:
     * `game_deleted` y `DelayedRemove()`; con `remove`, `UTIL_Remove`. `fade`
     * desvanece y no borra: se apunta.
     */
    entorno.borrarEntidad = (ref, opciones = {}) => {
      const ent = ref === null ? { que: "bicho", i, yo: true } : m._ent(ref, i);
      if (ent?.que === "bicho" && ent.i.creado) {
        if (opciones.modo === "fade") { apuntar("comando", "deleteent ... fade"); return; }
        m.borrar(ent.i, { avisar: opciones.modo !== "remove" });
        return;
      }
      base.borrarEntidad?.(ref, opciones);
    };
  }

  /** `StopWalking` (msmonsterserver.cpp:1400-1414): suelta el destino y avisa. */
  _parar(i, g) {
    if (!i.vuelo.conDestino) return;
    i.vuelo.conDestino = false;
    g?.guion?.llamar("game_stopmoving", []);
  }

  /**
   * EL `xdodamage` DE UNA INVOCACIÓN. Sólo la forma directa a un bicho con el
   * jugador de atacante, que es la de la Blood Drinker
   * (`xdodamage PARAM1 direct DMG_BASE 100% MY_OWNER ent_me MY_SKILL dark`,
   * :98): el daño es del jugador —su experiencia, su mensaje— y lo aplica
   * quien ya sabe hacerlo (`herir`). Lo demás se apunta.
   */
  _dano(i, d) {
    const g = this.guionSiHay?.(i) ?? null;
    const apuntar = (x) => g?.guion?.anotarNoSoportado("comando", x);
    if (d.forma !== "directo") { apuntar(`${d.comando} en forma «${d.forma}» desde una invocación`); return null; }
    const objetivo = this._ent(d.objetivo, i);
    const atacante = this._ent(d.atacante, i);
    if (objetivo?.que !== "bicho" || objetivo.yo) { apuntar(`${d.comando} a ${d.objetivo}`); return null; }
    if (atacante?.que !== "jugador") { apuntar(`${d.comando} con atacante ${d.atacante}`); return null; }
    if (!estaVivo(objetivo.i) || !this.herir) return null;
    // La tirada de acierto: `RANDOM_FLOAT(0,100) > chance` falla (giattack.cpp).
    if (d.acierto < 100 && this.azar() * 100 > d.acierto) return null;
    this.cuenta.danos++;
    return this.herir(objetivo.i, d.dano, { habilidad: String(d.habilidad ?? ""), tipo: String(d.tipo ?? ""), de: i });
  }

  /** Quita una entidad creada del mundo. */
  borrar(i, { avisar = true } = {}) {
    const k = this.vivos.indexOf(i);
    if (k < 0) return false;
    const g = this.guionSiHay?.(i) ?? null;
    if (avisar) g?.guion?.llamar("game_deleted", []);
    this.vivos.splice(k, 1);
    // El guion de una entidad borrada no corre más: sus `callevent` con
    // retraso y sus `repeatdelay` siguen en el reloj y vencerán en vacío.
    this.retirarGuion?.(i);
    if (i.asa) this.entidades?.borrar(i.asa);
    i.dormido = true;
    i.creado.borrado = true;
    this.cuenta.borrados++;
    this.alBorrar?.(i);
    return true;
  }

  // ── el paso ───────────────────────────────────────────────────────────────

  /**
   * Un paso del mundo de lo creado. La velocidad se integra en cada paso
   * (`MOVETYPE_FLY`: sin gravedad, sv_phys.cpp) y el `Think` del monstruo
   * corre cada 0,1 s, como el de todos (msmonsterserver.cpp:511).
   */
  paso(dt) {
    if (!this.vivos.length) { this._acumulado = 0; return 0; }
    for (const i of this.vivos) {
      const vel = i.vuelo?.vel;
      if (!vel || !i.vuelo.vuela || !vel.some((x) => x !== 0)) continue;
      const o = aMotor(i.donde, this.U);
      const fin = [o[0] + vel[0] * dt, o[1] + vel[1] * dt, o[2] + vel[2] * dt];
      // `SV_Physics_Toss` -> `SV_PushEntity`: se para donde toca el MUNDO. Un
      // `SOLID_TRIGGER` no choca con monstruos (ReHLDS sv_phys.cpp:1145-1165).
      const choque = this.trazar?.(o, fin) ?? null;
      if (choque) { i.donde = aEscena(choque, this.U); i.vuelo.vel = [0, 0, 0]; this.cuenta.choques = (this.cuenta.choques ?? 0) + 1; }
      else i.donde = aEscena(fin, this.U);
    }
    // `CMSMonster::Touch` (msmonsterserver.cpp:880-890): `game_touch <asa del
    // otro>`, en cada paso. Miraba una vez por `Think` y el guion, que se
    // limita con `game.time > NEXT_TOUCH` (estricto), pegaba cada DOS décimas:
    // la mitad del daño. Lo cazó la prueba contando golpes.
    for (const i of [...this.vivos]) {
      if (!i.creado.tocar || i.creado.borrado) continue;
      const g = this.guionSiHay?.(i) ?? null;
      if (!g) continue;
      const a = cajaDe(i, this.U);
      for (const x of this.instancias?.() ?? []) {
        if (x === i || !estaVivo(x) || x.creado?.borrado) continue;
        if (!seTocan(a, cajaDe(x, this.U))) continue;
        this.cuenta.toques++;
        g.guion?.llamar("game_touch", [this.asaDe(x)]);
        if (i.creado.borrado) break;
      }
    }
    this._acumulado += dt;
    let n = 0;
    while (this._acumulado >= PERIODO_THINK) {
      this._acumulado -= PERIODO_THINK;
      for (const i of [...this.vivos]) { if (!i.creado.borrado) this._pensar(i, PERIODO_THINK); }
      n++;
    }
    return n;
  }

  _pensar(i, intervalo) {
    const v = i.vuelo;
    if (!v?.vuela) return;                       // lo de combate piensa en la manada
    const g = this.guionSiHay?.(i) ?? null;
    this.cuenta.pensados++;

    // 1. `SetMoveDest` (msmonsterserver.cpp:994-1052).
    if (v.conDestino && v.destino) {
      const o = aMotor(i.donde, this.U);
      const ojo = [o[0], o[1], o[2] + altoDe(i)];           // `view_ofs = (0,0,m_Height)`, :250
      const t = [v.destino[0] - ojo[0], v.destino[1] - ojo[1], v.destino[2] - ojo[2]];
      const exacto = angulosDe(t);
      // `IsFlying() ? Length() : Length2D()` (:1018).
      if (Math.hypot(t[0], t[1], t[2]) <= v.proximidad) {
        v.vAngulos = [-exacto[0], exacto[1], 0];             // :1020-1022
        this.cuenta.llegadas++;
        this._parar(i, g);                                   // `StopWalking()`, :1025
        g?.guion?.llamar("game_reached_dest", []);           // :1027
      } else {
        v.vAngulos = [-exacto[0], v.vAngulos[1], 0];         // :1044-1046
        g?.guion?.llamar("game_movingto_dest", [textoDeVector(exacto)]);   // :1049-1051
      }
    }
    if (i.creado.borrado) return;

    // 2. `Move` (:1162-1240): lo que vuela encara su destino ENTERO, en 3D y
    //    sin ritmo de giro (:1175-1181), y avanza `m_flGroundSpeed` por
    //    segundo hacia donde mira (:1190-1201).
    if (v.conDestino && v.destino) {
      const o = aMotor(i.donde, this.U);
      const d = [v.destino[0] - o[0], v.destino[1] - o[1], v.destino[2] - o[2]];
      const L = Math.hypot(d[0], d[1], d[2]);
      const ang = angulosDe(L === 0 ? [0, 0, 1] : d);
      v.vAngulos = [-ang[0], ang[1], 0];
      i.yaw = (ang[1] * Math.PI) / 180;
    }
    if (v.suelo) {
      const f = frenteDe(v.vAngulos);
      const total = v.suelo * (i.fisica?.ritmoAnim ?? 1) * intervalo * (i.fisica?.ritmoAndar ?? 1);
      const o = aMotor(i.donde, this.U);
      i.donde = aEscena([o[0] + f[0] * total, o[1] + f[1] * total, o[2] + f[2] * total], this.U);
    }
  }

  /** Para la sonda y las pruebas: qué hay creado, sin recalcular nada. */
  estado() {
    return this.vivos.map((i) => ({
      id: i.id, asa: i.asa ?? null, script: i.creado.script, creador: i.creado.creador,
      donde: [...i.donde], motor: aMotor(i.donde, this.U).map((x) => Math.round(x * 10) / 10),
      vuela: Boolean(i.vuelo?.vuela), conDestino: Boolean(i.vuelo?.conDestino),
      tocar: Boolean(i.creado.tocar), raza: i.raza ?? null, visible: i.nodo ? i.nodo.visible : null,
    }));
  }
}

/** La misma pregunta que `esDeCombate` de `InteraccionesNpc`: ¿tiene daño su ficha? */
const esDeCombate = (i) => Boolean(i?.ficha?.ia?.dano);

/**
 * La caja de un monstruo: `UTIL_SetSize(pev, (-w/2,-w/2,0), (w/2,w/2,h))`
 * (msmonsterserver.cpp:244), en unidades del motor.
 */
function cajaDe(i, U) {
  const o = aMotor(i.donde, U);
  const w = anchoDe(i) / 2, h = altoDe(i);
  return { min: [o[0] - w, o[1] - w, o[2]], max: [o[0] + w, o[1] + w, o[2] + h] };
}
const seTocan = (a, b) => [0, 1, 2].every((k) => a.min[k] <= b.max[k] && a.max[k] >= b.min[k]);

/**
 * ¿Es sólido lo que nace de este guion? Se lee de los comandos horneados, como
 * `nombreUnicoDe`: un `setsolid none` o `setsolid trigger` en cualquier bloque
 * (scriptcmds.cpp:6487) y no choca con nadie. Es una lectura ESTÁTICA —el
 * comando no corre en el intérprete—: un guion que cambie de sólido a mitad de
 * partida no se distingue, y queda dicho.
 */
export function esSolido(fichaDeGuion) {
  let solido = true;
  const mira = (cmds) => {
    for (const c of cmds ?? []) {
      if (c.nombre === "setsolid") {
        const p = String(c.params?.[0] ?? "").toLowerCase();
        if (p === "none" || p === "trigger") solido = false;
      }
      mira(c.hijos);
      for (const r of c.sino ?? []) mira(r);
    }
  };
  for (const e of fichaDeGuion?.eventos ?? []) mira(e.cmds);
  return solido;
}
