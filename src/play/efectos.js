// LOS EFECTOS: `applyeffect` y `removeeffect`. Un efecto es OTRO GUION pegado
// a una entidad.
//
// ── QUÉ HACE EL MOTOR, EN SU ORDEN ──────────────────────────────────────────
//
// `applyeffect <objetivo> <guion> [params...]` — `ScriptCmd_ApplyEffect`,
// scriptcmds.cpp:1865-1929, registrado en :156. Cuatro pasos:
//
//   1. El objetivo tiene que existir, tener guion y estar VIVO (o ser un
//      objeto): `if( pEntity && pEntity->GetScripted() && ( pEntity->IsAlive()
//      || pEntity->IsMSItem() ) )` (:1873). A un muerto no se le pega nada.
//   2. Se le avisa ANTES al objetivo, a todos sus guiones, con
//      `game_applyeffect` y estos parámetros: el nombre del comando, quién lo
//      manda (`EntToString(m.pScriptedEnt)`), y del guion del efecto en
//      adelante (:1889-1898). Si contesta con `m_ReturnData` puede DESVIAR el
//      efecto a otro (`redirect;<ent>`) o ANULARLO (`abort`) (:1899-1917).
//   3. `CGlobalScriptedEffects::ApplyEffect(Params[1], pScripted, pEntity,
//      &Parameters)` con `Parameters` = del tercer parámetro en adelante
//      (:1920-1923). O sea que **el objetivo y el guion se comen; PARAM1 del
//      efecto es el TERCER parámetro de la línea**.
//   4. Y en `ApplyEffect` (scriptedeffects.cpp:25-58):
//        a. `pScriptTarget->Script_Add(ScriptName, pTarget)`: el efecto se
//           AÑADE a la lista de guiones del objetivo (`m_Scripts`,
//           script.cpp:5855-5870). No es un hijo del que lo lanza: vive en el
//           objetivo, y su `ent_me` es el objetivo.
//        b. `Script->RunScriptEvents()`: corre lo que toca YA —los bloques sin
//           nombre, que ponen `game.effect.id`— (:35, «Initialize
//           'game.effect.X'»).
//        c. LA PILA. Si ya hay en el objetivo otro guion con el mismo
//           `game.effect.id`: con `nostack` en `game.effect.flags` el nuevo se
//           marca para borrar y no se activa; sin él, se le llama
//           `game_duplicated` y se sigue (:41-54).
//        d. `game_activate` con los parámetros (:59).
//
// `removeeffect <objetivo> <id>` — scriptcmds.cpp:5068-5106, registrado en
// :210: por CADA guion del objetivo cuyo `game.effect.id` sea ése,
// `effect_die` y `RemoveNextFrame` (:5096-5102).
//
// `removescript` — scriptcmds.cpp:5114-5119: si el guion es un efecto,
// `effect_die`; y en cualquier caso `RemoveNextFrame`. **No corta el evento**:
// lo que va detrás en el mismo bloque sigue corriendo.
//
// `RemoveNextFrame` no borra en el acto: lo borra el siguiente
// `IScripted::RunScriptEvents` del objetivo, ANTES de correr nada suyo
// (script.cpp:5906-5922). Mientras tanto sigue en `m_Scripts`, y por tanto
// sigue recibiendo los eventos del objetivo.
//
// ── Y LO QUE NO SE VE LEYENDO UN EFECTO: QUIÉN LE HABLA ─────────────────────
//
// `IScripted::CallScriptEvent` recorre **todos** los guiones de la entidad
// (script.cpp:5932-5937). Un efecto pegado al jugador oye su `game_death`,
// su `game_struck`, y cualquier `callexternal ent_me <evento>` que el jugador
// se haga a sí mismo. Por eso `effect_templock` se quita con
// `callexternal ent_owner ext_end_templock` desde el hacha: el evento no es
// del jugador, es del efecto que lleva puesto.
//
// ── QUÉ SE PORTA AQUÍ ───────────────────────────────────────────────────────
//
// Los cuatro pasos, la pila, `removeeffect`, `removescript`, el reparto de
// eventos del anfitrión a sus efectos y los relojes de cada efecto
// (`callevent <s>` y `repeatdelay`, que son POR GUION: un efecto tiene los
// suyos). Lo que no, con su motivo:
//
//   - El DESVÍO y la ANULACIÓN del paso 2: piden `m_ReturnData`, que este
//     puerto no tiene (`return` se apunta, `guion.js`). Se manda el evento y,
//     si alguien lo contesta, se apunta. Hoy lo contestan TRES guiones de los
//     2 884, y los tres son monstruos (`goblin_latch`, `worm_abyssal` y
//     `worm_abyssal_head`), que aquí no llevan guion.
//   - Quitarle los efectos a un MONSTRUO al morir (msmonsterserver.cpp:2470-
//     2482): los bichos de este puerto no son entidades con guion, así que
//     nadie puede llevar un efecto puesto que no sea el jugador. Al jugador
//     NO se le quitan al morir —ese bloque está comentado en player.cpp:772-
//     790—; sólo oye `game_death`, que ya le llega por el reparto.
//
// Este archivo no importa nada del DOM ni de Three, como todo `src/play/`.

import { Guion, entornoVacio, numDe, flotanteDelMotor } from "./guion.js";
import { resolverGuion } from "./cargador.js";
import { RelojDeGuiones } from "./npcguion.js";
import { relacionDeRazas, RELACION, RAZA_DEL_JUGADOR } from "../bsp/razas.js";
import { aTexto } from "./entidades.js";

// ═══════════════════════════════════════════════════════════════════════════
// EL 91: EL VENENO — lo que piden los `effects/dot_*` para hacer daño.
//
// Medido corriendo `effects/dot_poison` sobre un jugador ANTES de tocar nada:
// se paraba en `$get(,index)`, `$get(,relationship)`, `$get(,scriptvar)`,
// `$string_upto` y `$get_takedmg`, y el último —un getter sin soporte devuelve
// su propio texto, que `==` lee como 0— le hacía decir «You resist the
// poison.» y quitarse. Ver `doc/VENENO_91.md`.
//
// Lo que vive aquí, porque es de la ENTIDAD y no del intérprete:
//   - `BanderasDeEntidad`, el `m_scriptflags` de `CBaseEntity`;
//   - `ResistenciasDeEntidad`, el `m.GenericTDM` y `m.TakeDamageModifiers`
//     de `CMSMonster`, que lee `$get_takedmg` y escribe `takedmg`;
//   - `golpeDirecto`, la parte de `DoDamage` que decide si un golpe DIRECTO
//     entra (giattack.cpp:1657-1720);
//   - `aplicadorDeBicho`, cómo se ve un bicho de la manada desde el guion de
//     un efecto que él ha puesto.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LAS BANDERAS DE GUION de una entidad — `m_scriptflags`, cinco listas en
 * paralelo (nombres, tipos, valores, caducidades, avisos). Las escribe
 * `scriptflags` (scriptcmds.cpp:5265-5451) y las lee `$get_scriptflag`
 * (script.cpp:2322-2510). Son de la ENTIDAD: un veneno pegado al jugador y el
 * guion del jugador leen las mismas, y es así como `base_dot` sabe si ya
 * llevas ese veneno de ese atacante (effects/base_dot.script:156-177).
 */
export class BanderasDeEntidad {
  constructor({ esJugador = false } = {}) {
    this.esJugador = esJugador;
    /** `{ nombre, tipo, valor, caduca, aviso }`, en el orden del motor. */
    this.lista = [];
  }

  /**
   * `scriptflags <objetivo> <acción> ...`, con `ps` = la línea entera ya
   * resuelta (el objetivo en `ps[0]`). Devuelve lo que el intérprete tiene que
   * repartir: los avisos al jugador, las banderas caducadas —cada una es un
   * `game_scriptflag_expired`— y los parámetros del `game_scriptflag_update`.
   */
  ejecutar(ps, ahora = 0) {
    const r = { avisos: [], expirados: [], parametros: [], errores: [] };
    const accion = String(ps[1] ?? "");
    const n = ps.length;
    const t = Math.fround(ahora);
    const avisar = (b) => { if (this.esJugador && !String(b.aviso).startsWith("none")) r.avisos.push(b.aviso); };
    // `UTIL_VarArgs("%f", gpGlobals->time + atof(...))`: seis decimales.
    const cuando = (s) => (t + numDe(s)).toFixed(6);

    if (accion === "add" && n >= 3) {
      // Con «stack» en el nombre se permiten repetidos (:5288); si no, se
      // borran TODOS los del mismo nombre antes de añadir.
      if (!String(ps[2]).includes("stack")) this.lista = this.lista.filter((b) => b.nombre !== ps[2]);
      this.lista.push({
        nombre: String(ps[2]),
        tipo: String(ps[3] ?? ""),            // con tres parámetros el motor lee `Params[3]` sin mirar
        valor: n >= 5 ? String(ps[4]) : "1",
        // `> -1`: una caducidad de 0 caduca YA, no «nunca» (:5307).
        caduca: n >= 6 && numDe(ps[5]) > -1 ? cuando(ps[5]) : "-1",
        aviso: n >= 7 ? String(ps[6]) : "none",
      });
    }
    if (accion === "edit" && n >= 4) {
      // El ÚLTIMO con ese nombre: el bucle no tiene `break` (:5325-5328).
      let k = -1;
      this.lista.forEach((b, i) => { if (b.nombre === ps[2]) k = i; });
      if (k > -1) {
        const b = this.lista[k];
        b.tipo = String(ps[3]);
        if (n >= 5) b.valor = String(ps[4]);
        // Aquí es `> 0` y no `> -1`: «hacky edit fix» (:5334).
        if (n >= 6) b.caduca = numDe(ps[5]) > 0 ? cuando(ps[5]) : "-1";
        if (n >= 7) b.aviso = String(ps[6]);
      } else r.errores.push(`scriptflags edit - couldn't find name ${ps[2]}`);
    } else if (accion === "edit") r.errores.push("scriptflags edit - not enough parameters");

    if (accion === "remove") {
      // El PRIMERO y para: «if there's a duplicate name, you'll have to run
      // this again» (:5356).
      const k = this.lista.findIndex((b) => b.nombre === ps[2]);
      if (k > -1) { avisar(this.lista[k]); this.lista.splice(k, 1); }
    }
    if (accion === "remove_expired") {
      for (let i = 0; i < this.lista.length; i++) {
        const b = this.lista[i];
        const caduca = numDe(b.caduca);
        if (caduca > 0 && t > caduca) {
          avisar(b);
          r.expirados.push([b.nombre, b.tipo, b.valor, b.caduca, b.aviso]);
          this.lista.splice(i, 1);
          i -= 1;
        }
      }
    }
    if (accion === "cleartype") {
      for (let i = 0; i < this.lista.length; i++) {
        if (this.lista[i].tipo === ps[2]) { avisar(this.lista[i]); this.lista.splice(i, 1); i -= 1; }
      }
    }
    if (accion === "clearall") {
      // EL FALLO DEL MOTOR, portado: el bucle sube `i` MIENTRAS borra la
      // casilla 0 y la lista se encoge, así que `clearall` borra la MITAD
      // (redondeando hacia arriba) — scriptcmds.cpp:5422-5435.
      for (let i = 0; i < this.lista.length; i++) { avisar(this.lista[0]); this.lista.shift(); }
    }

    r.parametros = [accion];
    for (let i = 2; i <= 5 && i < n; i++) r.parametros.push(String(ps[i]));
    return r;
  }

  /**
   * `$get_scriptflag(<ent>,<nombre|tipo>,<modo>)` — script.cpp:2322-2510.
   *
   * Los modos y lo que contestan cuando no hay nada, que no es lo mismo para
   * todos (:2342-2386): `name_exists` y `type_exists` dicen «0», el resto
   * «none». Un modo que no está en la lista deja todo apagado y se comporta
   * como `type_exists`… pero sin encontrar devuelve «» (cadena vacía).
   */
  leer(que, modo, { apuntar = null } = {}) {
    const m = String(modo);
    let sumar = false, porNombre = false, primero = false, valorPorNombre = false;
    let tipoPorNombre = false, contar = false, enLista = false;
    let noHay = "";
    if (m === "totalvalue" || m === "type_value") { noHay = "none"; sumar = true; }
    else if (m === "name_exists") { noHay = "0"; porNombre = true; }
    else if (m === "first_value" || m === "type_first") { noHay = "none"; primero = true; }
    else if (m === "name_value") { noHay = "none"; porNombre = true; valorPorNombre = true; }
    else if (m === "name_type") { noHay = "none"; porNombre = true; tipoPorNombre = true; }
    else if (m === "type_count") { noHay = "none"; sumar = true; contar = true; }
    else if (m === "type_array") { noHay = "none"; sumar = true; enLista = true; }
    else if (m === "type_exists") noHay = "0";
    if (que === "listall") return "0";            // una lista por consola
    let hallado = false;
    let total = 0;
    for (const b of this.lista) {
      if (!porNombre && b.tipo === que) {
        if (!sumar) return primero ? b.valor : "1";
        hallado = true;
        if (enLista) { apuntar?.("$get_scriptflag type_array (crea una lista en la entidad)"); continue; }
        total += contar ? 1 : numDe(b.valor);
      }
      if (porNombre && b.nombre === que) {
        if (tipoPorNombre) return b.tipo;
        if (valorPorNombre) return b.valor;
        return "1";
      }
    }
    if (!hallado) return noHay;
    return enLista ? `ARRAY_${String(que).toUpperCase()}` : flotanteDelMotor(total);
  }
}

/**
 * LO QUE A UNA ENTIDAD LE DUELE CADA TIPO DE DAÑO — `m.GenericTDM` y
 * `m.TakeDamageModifiers` de `CMSMonster` (msmonster.h:341-343). El jugador es
 * un `CMSMonster`, y de aquí sale lo que `base_dot` usa para decidir si
 * resistes un veneno.
 *
 * Y LAS DOS PUERTAS NO MIRAN IGUAL, que es lo que no se adivina:
 *   - `$get_takedmg` busca la PRIMERA cuyo tipo guardado CONTENGA lo que se
 *     pregunta (`read_dmgtype.contains(Params[1])`, script.cpp:2585), y sin
 *     ninguna devuelve «1.0» —literal, con un decimal— (:2588). «all» es el
 *     genérico, con `RETURN_FLOAT` (:2581).
 *   - El daño de verdad multiplica por el genérico y por TODAS las cuyo tipo
 *     guardado sea PREFIJO del tipo entrante (`starts_with`,
 *     msmonsterserver.cpp:2269-2281).
 */
export class ResistenciasDeEntidad {
  constructor() {
    /** `GenericTDM = 1.0f` (msmonster.h:341). */
    this.generica = 1;
    this.lista = [];
  }

  /** `takedmg <tipo|all> <mult>` (npcscript.cpp:1057-1094). Un tipo repetido se sustituye. */
  poner(tipo, mult) {
    const m = Math.fround(Number(mult) || 0);
    if (tipo === "all") { this.generica = m; return; }
    let hay = false;
    for (const x of this.lista) if (x.tipo === tipo) { x.mult = m; hay = true; }
    if (!hay) this.lista.push({ tipo: String(tipo), mult: m });
  }

  /** `$get_takedmg(<ent>,<tipo>)`. */
  leer(tipo) {
    if (tipo === "all") return flotanteDelMotor(this.generica);
    for (const x of this.lista) if (x.tipo.includes(tipo)) return flotanteDelMotor(x.mult);
    return "1.0";
  }

  /** Lo que llega de un golpe de `tipo`, por `CMSMonster::TraceAttack`. */
  multiplicar(dano, tipo) {
    let d = Math.fround(dano * this.generica);
    for (const x of this.lista) if (String(tipo ?? "").startsWith(x.tipo)) d = Math.fround(d * x.mult);
    return d;
  }
}

/** `IRelationship` en texto, como lo contesta `$get(<ent>,relationship,<otro>)` (scriptcmds.cpp:1392-1414). */
export function relacionEnTexto(r) {
  switch (r) {
    case RELACION.ALIADO: return "ally";
    case RELACION.RECELO: return "wary";
    case RELACION.MIEDO: case RELACION.DESPRECIO: case RELACION.ODIO: case RELACION.NEMESIS: return "enemy";
    default: return "neutral";                         // RELATIONSHIP_NO, _NE y el `default`
  }
}

/**
 * UN BICHO DE LA MANADA VISTO DESDE EL GUION DE UN EFECTO QUE ÉL HA PUESTO.
 *
 * `applyeffect PARAM2 effects/dot_poison 5.0 $get(ent_me,id) DOT_POISON`
 * (monsters/dwarf_zombie_hbow.script, `bolt_dodamage`): el bicho se pasa a sí
 * mismo como atacante, y el veneno le pregunta cosas cada segundo. Hoy no lo
 * llama el juego —los bichos de este puerto no corren guion, es el trabajo
 * del otro agente— y lo usa la sonda; está aquí para que el día que el bicho
 * lo haga, se vea igual.
 *
 * @param i       la instancia de la manada (`ficha`, `vida`, `muerto`…)
 * @param indice  su posición en la manada; el asa lleva 100 + índice para no
 *                pisar a los jugadores, que en GoldSrc son las entidades
 *                1..maxClients. La «dirección» es el índice + 1: un contador
 *                propio, como hace `src/play/entidades.js`.
 * @param razas   la tabla de razas, para la relación del JUGADOR hacia él
 */
export function aplicadorDeBicho(i, { indice = 0, razas = null } = {}) {
  const id = aTexto(100 + indice, indice + 1);
  const nombre = String(i?.ficha?.nombre ?? "");
  // `m_DMGMulti` —sólo si es > 0 (scriptcmds.cpp:7362)—. Es el `dmgmulti`
  // del horneado del bicho.
  const mult = numDe(i?.ficha?.postspawn?.dmgmulti ?? "0");
  return {
    id,
    nombre,
    instancia: i,
    esJugador: false,
    indice: 100 + indice,
    /**
     * `RetrieveEntity(asa)` todavía lo encuentra. Un bicho MUERTO sigue siendo
     * una entidad mientras dura su cadáver, y el veneno que puso sigue
     * haciendo daño hasta que se borra: `xdodamage` sólo sale si no hay
     * atacante (:7351-7352), no si está muerto. Aquí el cadáver se va al
     * apagarse del todo (`CADAVER`, manada.js) o al dormirse.
     */
    existe: () => Boolean(i) && !i.dormido && !(i.muerto && (i.opacidad ?? 1) <= 0),
    vivo: () => Boolean(i) && !i.muerto && (i.vida ?? 0) > 0,
    multDano: mult > 0 ? mult : 1,
    /**
     * `CanDamage` del bicho hacia el jugador: «I have a bad or nonexistant
     * relationship» (`IRelationship(pOther) <= RELATIONSHIP_NE`,
     * msmonsterserver.cpp:83-87). La relación horneada es la del bicho HACIA
     * el jugador (`tools/bichos.mjs`).
     */
    puedeHerirAlAnfitrion: () => (i?.ficha?.relacion ?? RELACION.SIN_RAZA) <= RELACION.NEUTRAL,
    /** `$get(<jugador>,relationship,<este bicho>)`: la del jugador HACIA él (player.cpp:6178-6192). */
    relacionDelJugador: razas ? relacionEnTexto(relacionDeRazas(razas, RAZA_DEL_JUGADOR, i?.ficha?.ia?.raza)) : null,
    propiedad(prop) {
      switch (String(prop)) {
        case "id": return id;
        case "name": return nombre;
        case "isplayer": return "0";
        case "exists": return "1";
        case "alive": case "isalive": return this.vivo() ? "1" : "0";
        case "hp": return flotanteDelMotor(i?.vida ?? 0);
        case "index": return String(100 + indice);
        // `$get(<bicho>,dmgmulti)` — `RETURN_FLOAT(pMonster->m_DMGMulti)`
        // (scriptcmds.cpp:1478), que al nacer vale 1 si era 0
        // (msmonsterserver.cpp:276-277). Lo pide `game_dodamage` de
        // base_monster_shared.script:1336 para repartir el veneno por mapa.
        case "dmgmulti": return flotanteDelMotor(mult > 0 ? mult : 1);
        default: return null;                          // que lo apunte quien pregunta
      }
    },
  };
}

/**
 * EL GOLPE DIRECTO: la parte de `DoDamage` que decide si entra, para la forma
 * `direct` y un objetivo que es un `CMSMonster` vivo —el jugador lo es—.
 * giattack.cpp:1532-1545 (la lista de uno) y :1657-1720 (el golpe).
 *
 *   1. Sin atacante, nada (`if( !Damage.pAttacker ) return 0`,
 *      scriptcmds.cpp:7352). Un jugador muerto tampoco pega (:7357-7360).
 *   2. El daño por el `m_DMGMulti` del atacante si es > 0 (:7362).
 *   3. `CanDamage`: si no puede herirle, no entra (giattack.cpp:1694).
 *   4. La tirada: `RANDOM_LONG(0, 99) < 100 - acierto` FALLA (:1709-1713).
 *      Con el 100 de los venenos no falla nunca.
 *   5. `AccuracyRoll = acierto - tirada` (:1730), que es lo que el parry
 *      compara después.
 *
 * Lo que NO se porta: el crítico (sólo un objeto lo tiene), el
 * `game_damaged_other` del ATACANTE y su `m_ReturnData` (:1734-1776) —los
 * bichos no corren guion—, y el mensaje «%s misses you.» de un fallo
 * (:1997-2003), que con acierto 100 no sale.
 */
export function golpeDirecto({ d, atacante, azar = (a, b) => a + Math.floor(Math.random() * (b - a + 1)) }) {
  if (!atacante || (atacante.existe && !atacante.existe())) return { entra: false, porQue: "sin atacante" };
  if (atacante.esJugador && atacante.vivo && !atacante.vivo()) return { entra: false, porQue: "atacante muerto" };
  const mult = d.multiplicaDe === "atacante" && atacante.multDano > 0 ? atacante.multDano : 1;
  const dano = Math.fround(d.dano * mult);
  if (atacante.puedeHerirAlAnfitrion && !atacante.puedeHerirAlAnfitrion()) return { entra: false, porQue: "no puede herirle" };
  const tirada = azar(0, 99);
  if (tirada < 100 - d.acierto) return { entra: false, falla: true, porQue: "falla", tirada };
  return { entra: true, dano, tipo: d.tipo, acierto: d.acierto - tirada, tirada };
}

/** Lo que el motor llama a los efectos, en un sitio para leerlo de un vistazo. */
export const EVENTOS_DEL_EFECTO = Object.freeze({
  /** Al objetivo, antes de nada. scriptcmds.cpp:1898. */
  AVISO: "game_applyeffect",
  /** Al efecto nuevo si ya había uno igual y la pila se permite. scriptedeffects.cpp:51. */
  DUPLICADO: "game_duplicated",
  /** Al efecto, con sus parámetros. scriptedeffects.cpp:59. */
  ACTIVA: "game_activate",
  /** Al efecto, al quitarlo. scriptcmds.cpp:5100 y :5116. */
  MUERE: "effect_die",
});

/**
 * Los guiones de efecto horneados (`npm run efectos:guion`), con los
 * `#include` SIN resolver: los efectos comparten `base_effect` y `base_dot`
 * casi todos, y se guarda cada archivo una vez — lo mismo que hace
 * `GuionesDeObjeto` con los objetos.
 */
export class TablaDeEfectos {
  constructor(ficha = null) {
    this.ficha = ficha;
    this._cache = new Map();
  }

  /** `effects/dot_poison`, sin comillas y sin `.script`. */
  static normalizar(ruta) {
    return String(ruta ?? "").trim().replace(/^["']|["']$/g, "").replace(/\.script$/i, "");
  }

  tiene(ruta) { return Boolean(this.ficha?.archivos?.[TablaDeEfectos.normalizar(ruta)]); }

  /** El guion con sus `#include` resueltos EN SU SITIO, o `null` si no está horneado. */
  resolver(ruta) {
    const r = TablaDeEfectos.normalizar(ruta);
    if (this._cache.has(r)) return this._cache.get(r);
    const tabla = this.ficha?.archivos ?? {};
    const hecho = tabla[r] ? resolverGuion(r, (x) => tabla[x] ?? null, new Set()) : null;
    this._cache.set(r, hecho);
    return hecho;
  }
}

/**
 * LOS `const` Y `setvar` DE CABECERA, RESUELTOS AL CARGAR — como el motor.
 *
 *     VarValue = msstring(GETCONST_COMPATIBLE(VarValue));     script.cpp:5409
 *     #define SCRIPTCONST( a ) SCRIPTVAR(GetConst(a))  //... loadtime only
 *     #define GETCONST_COMPATIBLE( a ) ( a.c_str()[0] == '$' ? GetConst(a) : SCRIPTCONST(a) )
 *                                                             script.cpp:40-41
 *
 * O sea que el VALOR de un `const` se resuelve contra lo que ya se ha cargado,
 * **en el momento de cargarlo**. Y los efectos dependen de eso para la pila:
 *
 *     const EFFECT_FLAGS nostack                  effects/effect_templock.script:7
 *     #include effects/base_effect
 *       const game.effect.flags EFFECT_FLAGS      effects/base_effect.script:44
 *
 * `game.effect.flags` vale «nostack» en el motor, y es lo que lee
 * `ApplyEffect` (scriptedeffects.cpp:45-46). El intérprete de este puerto
 * guarda la cabecera CRUDA (`partirGuion`, `valor: ps.slice(2).join(" ")`) y
 * resuelve cada nombre una sola vez, así que ahí `game.effect.flags` vale la
 * cadena «EFFECT_FLAGS» y **ningún efecto con `nostack` se negaría nunca a
 * apilarse**. Medido: 23 efectos lo declaran.
 *
 * Esto lo arregla para los efectos y SÓLO para ellos, a propósito: cambiar la
 * carga de todos los guiones —jugador, NPC, objetos— mueve números en todos
 * los mapas y pide su propio experimento. Queda dicho en el informe.
 */
export function cargarCabecera(guion, preload = []) {
  for (const p of preload) {
    const crudo = String(p.valor ?? "");
    const c = guion.constantes.has(crudo) ? guion.constantes.get(crudo) : crudo;   // `GetConst`
    const valor = crudo.startsWith("$") ? c : String(guion.resolver(c));         // `SCRIPTVAR`
    if (p.tipo === "const") {
      // Gana el PRIMERO (script.cpp:5419-5433).
      if (!guion.constantes.has(p.nombre)) guion.constantes.set(p.nombre, valor);
    } else {
      guion.vars.set(p.nombre, valor);
    }
  }
}

/**
 * Un efecto corriendo, pegado a un anfitrión. Es un `Guion` normal —el MISMO
 * intérprete que el jugador, los NPC y los objetos— con su propio reloj y su
 * propia bandera de «bórrame en el siguiente fotograma».
 */
export class GuionDeEfecto {
  constructor({ ruta, resuelto, lista, aplicador = null, conocidos = [] }) {
    this.ruta = TablaDeEfectos.normalizar(ruta);
    this.lista = lista;
    this.aplicador = aplicador;
    /** EL 91: otras entidades a las que este efecto puede nombrar (ver `entornoDelEfecto`). */
    this.conocidos = conocidos;
    /** EL 91: cada `xdodamage` directo y lo que decidió `golpeDirecto`. Para medir. */
    this.golpes = [];
    /** `m.RemoveNextFrame`. */
    this.quitar = false;
    /** Los `callevent <s>` de ESTE guion: en el motor, cada `CScript` tiene los suyos. */
    this.reloj = new RelojDeGuiones();
    this.noSoportados = [];
    this.guion = new Guion({
      eventos: resuelto?.eventos ?? [],
      preload: [],
      nombre: this.ruta,
      ahora: () => lista.ahora(),
      entorno: entornoDelEfecto(this),
    });
    cargarCabecera(this.guion, resuelto?.preload ?? []);
  }

  /** `game.effect.id`, o `null` si este guion no es un efecto (`VarExists`, script.cpp:438). */
  get id() {
    return this.guion.existeVar("game.effect.id") ? String(this.guion.resolver("game.effect.id")) : null;
  }

  /** `game.effect.flags`, resuelto como lo dejó la carga. */
  get banderas() {
    return this.guion.existeVar("game.effect.flags") ? String(this.guion.resolver("game.effect.flags")) : "";
  }

  llamar(nombre, params = []) { return this.guion.llamar(String(nombre), params.map(String)); }

  /** `removescript` (scriptcmds.cpp:5114-5119). */
  quitarse() {
    if (this.id !== null) this.llamar(EVENTOS_DEL_EFECTO.MUERE);
    this.quitar = true;
  }

  paso(dt) { return this.guion.pasoDeRepeticiones(this.lista.ahora()) + this.reloj.paso(dt); }
}

/**
 * LOS EFECTOS DE UNA ENTIDAD: su `m_Scripts`, menos el guion propio.
 *
 * @param tabla      la `TablaDeEfectos`
 * @param anfitrion  `{ id(), esJugador, vivo(), entorno(), llamar(evento, params) }`.
 *                   `entorno()` es el entorno del guion PROPIO del anfitrión
 *                   —sus ganchos al juego— y `llamar` es su `CallScriptEvent`,
 *                   que llega a su guion Y a sus efectos.
 *                   EL 91 añade, opcionales: `indice()` (`entindex`),
 *                   `variable(nombre)` (`GetFirstScriptVar`, su guion
 *                   PROPIO), `banderas()`, `resistencias()` y `herir(golpe)`,
 *                   la puerta del daño. Sin ellos, lo que los pida se apunta.
 * @param ahora      el reloj en segundos (`game.time`)
 */
export class EfectosDeEntidad {
  constructor({ tabla = null, anfitrion = null, ahora = () => 0 } = {}) {
    this.tabla = tabla;
    this.anfitrion = anfitrion;
    this.ahora = ahora;
    /** Los efectos puestos, en orden de llegada (el de `m_Scripts`). */
    this.lista = [];
    /** Lo pedido y lo que pasó con ello, para las pruebas y la sonda. */
    this.historial = [];
    this.noSoportados = [];
  }

  apuntar(tipo, nombre) {
    if (!this.noSoportados.some((x) => x.tipo === tipo && x.nombre === nombre)) this.noSoportados.push({ tipo, nombre });
  }

  /** ¿`ref` es el anfitrión? `ent_me` dentro de sus guiones, o su propio asa. */
  esAnfitrion(ref) {
    const r = String(ref ?? "");
    return r === "ent_me" || (r !== "" && r === String(this.anfitrion?.id?.() ?? ""));
  }

  /**
   * `$get(<el anfitrión>,<prop>)` visto desde un efecto. Contesta su entorno,
   * más las cuatro que en el motor son de CUALQUIER entidad —`id`,
   * `isplayer`, `exists`, `alive` (scriptcmds.cpp:950-1300)— y que el entorno
   * del jugador no sabe decir de sí mismo.
   */
  propiedadDelAnfitrion(prop, extra) {
    const anf = this.anfitrion;
    const p = String(prop);
    if (p === "id") return String(anf?.id?.() ?? "0");
    if (p === "isplayer") return anf?.esJugador ? "1" : "0";
    if (p === "exists") return "1";
    if (p === "alive" || p === "isalive") return anf?.vivo?.() === false ? "0" : "1";
    // EL 91. `entindex()` (scriptcmds.cpp:956) y `scriptvar`, que lee el
    // PRIMER guion de la entidad —el suyo, no el efecto que pregunta—
    // (`GetFirstScriptVar`, script.cpp:5949-5955). Sin el gancho, `null`:
    // quien pregunta lo apunta.
    if (p === "index") return anf?.indice ? String(anf.indice()) : null;
    if (p === "scriptvar") return anf?.variable ? String(anf.variable(String(extra?.[0] ?? ""))) : null;
    const base = anf?.entorno?.();
    return String(base?.propiedad ? base.propiedad("ent_me", p, extra) ?? "0" : "0");
  }

  /**
   * `applyeffect` sobre ESTA entidad. Devuelve el `GuionDeEfecto` o `null`.
   *
   * @param aplicador  `{ id, propiedad(prop) }` de quien lo manda: su asa —lo
   *                   que su guion contestó a `$get(ent_me,id)`— y cómo
   *                   leerle. El efecto lo necesita porque casi todos reciben
   *                   al atacante como parámetro y le preguntan el nombre.
   */
  aplicar(ruta, params = [], { aplicador = null, conocidos = [] } = {}) {
    const r = TablaDeEfectos.normalizar(ruta);
    const apunte = { ruta: r, params: params.map(String), resultado: null };
    this.historial.push(apunte);

    // 1. Vivo. scriptcmds.cpp:1873.
    if (this.anfitrion?.vivo && !this.anfitrion.vivo()) { apunte.resultado = "muerto"; return null; }

    // 2. `game_applyeffect` al objetivo entero, con el nombre del comando y el
    //    asa de quien lo manda delante. scriptcmds.cpp:1890-1898.
    const contestado = this.anfitrion?.llamar?.(EVENTOS_DEL_EFECTO.AVISO,
      ["applyeffect", String(aplicador?.id ?? "0"), r, ...params.map(String)]);
    if (contestado) this.apuntar("game_applyeffect", "contestado, y el desvío/anulación pide m_ReturnData");

    // 3a. `Script_Add`. Sin el archivo, el motor avisa y no hace nada
    //     (scriptedeffects.cpp:28-32).
    const resuelto = this.tabla?.resolver(r) ?? null;
    if (!resuelto || !resuelto.eventos.length) {
      this.apuntar("efecto sin hornear", r);
      apunte.resultado = "no existe";
      return null;
    }
    const ef = new GuionDeEfecto({ ruta: r, resuelto, lista: this, aplicador, conocidos });
    this.lista.push(ef);

    // 3b. `RunScriptEvents()`: lo que toca ya. El bloque sin nombre es un
    //     evento «programado para ya» (script.cpp:5198-5202), y `repeatdelay`
    //     se arma al CARGAR (script.cpp:5377-5382) — por eso se arma antes.
    ef.guion.armarRepeticiones(this.ahora());
    ef.guion.llamar("", []);
    ef.guion.pasoDeRepeticiones(this.ahora());

    // 3c. LA PILA. scriptedeffects.cpp:41-54. Se compara con TODOS los guiones
    //     de la entidad, también los marcados para borrar que aún no se han
    //     barrido: el bucle del motor no mira `RemoveNextFrame`.
    const id = ef.id;
    if (id !== null) {
      const otro = this.lista.find((x) => x !== ef && x.id === id);
      if (otro) {
        if (ef.banderas.includes("nostack")) {
          ef.quitar = true;            // sin `effect_die`: el motor no lo llama aquí
          apunte.resultado = "nostack";
          return null;
        }
        ef.llamar(EVENTOS_DEL_EFECTO.DUPLICADO);
      }
    }

    // 3d. `game_activate` con PARAM1 = el tercer parámetro de la línea.
    ef.llamar(EVENTOS_DEL_EFECTO.ACTIVA, params);
    apunte.resultado = ef.quitar ? "activado y quitado" : "activo";
    apunte.id = id;
    return ef;
  }

  /** `removeeffect <objetivo> <id>`: TODOS los que lleven ese id (scriptcmds.cpp:5096-5102). */
  quitarPorId(id) {
    let n = 0;
    for (const ef of [...this.lista]) {
      if (ef.id === null || ef.id !== String(id)) continue;
      ef.llamar(EVENTOS_DEL_EFECTO.MUERE);
      ef.quitar = true;
      n++;
    }
    return n;
  }

  /**
   * El `CallScriptEvent` del anfitrión, en su parte de efectos. Llega también a
   * los marcados para borrar: siguen en `m_Scripts` hasta el siguiente barrido.
   */
  llamar(nombre, params = []) {
    let hubo = false;
    for (const ef of [...this.lista]) if (ef.llamar(nombre, params)) hubo = true;
    return hubo;
  }

  /**
   * Un fotograma: primero se barren los marcados, luego corre el resto.
   * `IScripted::RunScriptEvents`, script.cpp:5906-5922.
   */
  paso(dt = 0) {
    this.lista = this.lista.filter((ef) => !ef.quitar);
    let n = 0;
    for (const ef of [...this.lista]) n += ef.paso(dt);
    return n;
  }

  /** Los que siguen puestos (sin los marcados). Para la sonda. */
  get activos() {
    return this.lista.filter((ef) => !ef.quitar).map((ef) => ({ ruta: ef.ruta, id: ef.id }));
  }

  /**
   * Los ganchos que el guion PROPIO del anfitrión necesita para que sus
   * `applyeffect ent_me …` y `removeeffect ent_me …` lleguen aquí. Lo que
   * apunte a otra entidad se apunta y no se finge: en este puerto el único
   * anfitrión es el jugador.
   */
  ganchos({ apuntar = null, base = null } = {}) {
    const yo = this;
    const propiedadDeAntes = base?.propiedad ?? null;
    return {
      /**
       * `$get(ent_me,id)` en el guion PROPIO del anfitrión. El entorno del
       * jugador no lo contestaba —salía «»— y el efecto sí lo necesita: es el
       * asa que el guion le pasa como «quién me lo aplica», y el efecto la
       * compara con la suya. Con «» frente a «jugador1», curarse a uno mismo
       * salía «Sonda heals you» en vez de «You heal yourself»
       * (effects/effect_rejuv2.script:30-44). En el motor las dos son el mismo
       * `EntToString` (sharedutil.cpp:81). Sólo `id`: lo demás sigue igual.
       */
      propiedad(ref, prop, extra) {
        if (String(prop) === "id" && yo.esAnfitrion(ref)) return yo.propiedadDelAnfitrion("id");
        return propiedadDeAntes ? propiedadDeAntes(ref, prop, extra) : "0";
      },
      aplicarEfecto(ref, ruta, params = [], { desde = null } = {}) {
        if (!yo.esAnfitrion(ref)) { apuntar?.("applyeffect", `${ref} ${ruta} (objetivo sin guion)`); return null; }
        // Quien lo manda es el propio anfitrión: su asa es lo que SU guion
        // contesta a `$get(ent_me,id)`, que es lo que le habrá pasado al efecto
        // como atacante. Así `$get(DOT_ATTACKER,id) equals $get(ent_me,id)`
        // —«cannot afflict myself», effects/base_dot.script:83— se cumple.
        const id = String(desde?.resolver?.("$get(ent_me,id)") ?? yo.anfitrion?.id?.() ?? "0");
        return yo.aplicar(ruta, params, { aplicador: { id, propiedad: (p, x) => yo.propiedadDelAnfitrion(p, x) } });
      },
      quitarEfecto(ref, id) {
        if (!yo.esAnfitrion(ref)) { apuntar?.("removeeffect", `${ref} ${id} (objetivo sin guion)`); return 0; }
        return yo.quitarPorId(id);
      },
    };
  }
}

/**
 * El entorno de un efecto: el de su anfitrión, con lo que cambia por ser OTRO
 * guion de la misma entidad.
 *
 *   - `ent_me` es el anfitrión, no quien lo lanzó.
 *   - Los relojes son suyos.
 *   - `callexternal ent_me` va al anfitrión ENTERO —su guion y todos sus
 *     efectos, este incluido—, que es `CallScriptEvent`.
 *   - Las otras entidades: sólo se conoce a quien lo aplicó, y —el 91— a
 *     quien conocía el efecto que lo puso: `effect_spiderlatch` pone
 *     `dot_poison` sobre su propio anfitrión pasándole la ARAÑA como atacante
 *     (`applyeffect ent_me effects/dot_poison $pass(PARAM1) $pass(PARAM2) …`,
 *     effects/effect_spiderlatch.script:18), y en el motor cualquier guion
 *     encuentra cualquier entidad por su asa (`RetrieveEntity`).
 */
function entornoDelEfecto(ef) {
  const lista = ef.lista;
  const anf = lista.anfitrion;
  const base = { ...entornoVacio(), ...(anf?.entorno?.() ?? {}) };
  const esYo = (ref) => lista.esAnfitrion(ref);
  const esAplicador = (ref) => ef.aplicador && String(ref ?? "") === String(ef.aplicador.id ?? "");
  /** La entidad de un asa, entre las que este efecto conoce; `null` si no. */
  const conocido = (ref) => {
    const r = String(ref ?? "");
    if (!r) return null;
    if (esAplicador(r)) return ef.aplicador;
    return ef.conocidos.find((x) => String(x?.id ?? "") === r) ?? null;
  };
  const apuntar = (tipo, nombre) => {
    if (!ef.noSoportados.some((x) => x.tipo === tipo && x.nombre === nombre)) ef.noSoportados.push({ tipo, nombre });
  };
  return {
    ...base,
    programar: (s, que) => ef.reloj.programar(s, que),
    apuntar,

    /**
     * `$get(<ent>,<prop>)`. Del anfitrión contesta él, más las tres que en el
     * motor son de cualquier entidad (`id`, `isplayer`, `alive`,
     * scriptcmds.cpp:950-1300) y que el entorno del jugador no sabe de sí
     * mismo. Del aplicador contesta el aplicador. Lo demás no existe aquí.
     */
    propiedad(ref, prop, extra) {
      const p = String(prop);
      if (esYo(ref)) {
        // EL 91: `relationship` del anfitrión hacia OTRO (scriptcmds.cpp:1392):
        // la contesta quien la sabe, que es el otro —un bicho sabe la raza—.
        if (p === "relationship") {
          const otro = conocido(extra?.[0]);
          if (otro?.relacionDelJugador && anf?.esJugador) return otro.relacionDelJugador;
          apuntar("propiedad", "$get(ent_me,relationship,<sin raza conocida>)");
          return "0";
        }
        const v = lista.propiedadDelAnfitrion(p, extra);
        if (v === null) { apuntar("propiedad", `$get(ent_me,${p}) (el anfitrión no lo sabe)`); return "0"; }
        return v;
      }
      const otro = conocido(ref);
      if (otro) {
        // `scriptvar` de un BICHO: en el motor lee su primer guion; aquí los
        // bichos no corren guion, así que se contesta lo que el motor da para
        // una variable que no existe —su nombre (script.cpp:4741)— Y SE
        // APUNTA, porque es un valor de reposo con cara de respuesta (el 82).
        if (p === "scriptvar") {
          if (otro.variable) return String(otro.variable(String(extra?.[0] ?? "")));
          apuntar("propiedad", "$get(<entidad sin guion>,scriptvar)");
          return String(extra?.[0] ?? "");
        }
        const v = otro.propiedad?.(p, extra);
        if (v === null || v === undefined) { apuntar("propiedad", `$get(<${otro.nombre ?? otro.id}>,${p})`); return "0"; }
        return String(v);
      }
      apuntar("propiedad", `$get(<otra entidad>,${p})`);
      return "0";
    },

    // ── EL 91: LO QUE PIDE UN VENENO ───────────────────────────────────────
    /** `$get(...,index|scriptvar|relationship)`: las contesta `propiedad` de arriba. */
    propiedadesPropias: new Set(["index", "scriptvar", "relationship", "dmgmulti"]),

    /**
     * `$can_damage(<objetivo>,[quien])` — `quien->CanDamage(objetivo)`
     * (script.cpp:662-684). Entre el anfitrión-jugador y un bicho conocido:
     *   - jugador -> bicho: `CBasePlayer::CanDamage` cae a la de
     *     `CBaseEntity` (player.cpp:6194-6215): que pueda recibir daño, o sea
     *     que esté vivo (entity.cpp:58-62);
     *   - bicho -> jugador: la relación, `CMSMonster::CanDamage`
     *     (msmonsterserver.cpp:83-87).
     * Lo demás, `null`: lo apunta el intérprete.
     */
    puedeHerir(quien, objetivo) {
      if (esYo(quien)) {
        const otro = conocido(objetivo);
        return otro?.vivo ? otro.vivo() : null;
      }
      const otro = conocido(quien);
      if (otro && esYo(objetivo)) return otro.puedeHerirAlAnfitrion ? otro.puedeHerirAlAnfitrion() : null;
      return null;
    },

    /** `scriptflags`/`$get_scriptflag`: las banderas de la ENTIDAD (`pEntity->m_scriptflags`). */
    banderas(ref) {
      if (esYo(ref)) return anf?.banderas?.() ?? null;
      return null;
    },

    /** `$get_takedmg(<ent>,<tipo>)` — script.cpp:2569-2592. */
    recibeDano(ref, tipo) {
      if (esYo(ref)) {
        const r = anf?.resistencias?.();
        if (r) return r.leer(tipo);
        apuntar("$get_takedmg", "el anfitrión no tiene resistencias");
        return "-1";
      }
      // De otra entidad: un bicho tendría las suyas, y aquí no se saben.
      apuntar("$get_takedmg", "de otra entidad");
      return "-1";
    },

    /**
     * `xdodamage`/`dodamage` desde un efecto. Sólo la forma DIRECTA contra el
     * propio anfitrión —la de los venenos, `xdodamage $get(ent_me,id) direct
     * …` (effects/base_dot.script:64)—; lo demás se apunta.
     */
    hacerDano(d) {
      if (d.comando === "dodamage") { apuntar("dodamage", "desde un efecto: correría COMO el anfitrión"); return; }
      if (d.forma !== "directo") { apuntar(d.comando, `forma ${d.forma}`); return; }
      if (!esYo(d.objetivo)) { apuntar(d.comando, "directo a otra entidad"); return; }
      const atacante = esYo(d.atacante) ? null : conocido(d.atacante);
      if (!atacante) { apuntar(d.comando, esYo(d.atacante) ? "el anfitrión contra sí mismo" : "atacante desconocido"); return; }
      // El infligidor tiene que existir (`if ( !Damage.pInflictor ) return 0`,
      // scriptcmds.cpp:7351); en los venenos es el mismo atacante.
      const infligidor = esYo(d.infligidor) ? anf : conocido(d.infligidor);
      if (!infligidor) { apuntar(d.comando, "infligidor desconocido"); return; }
      const g = golpeDirecto({ d, atacante, azar: base.azar });
      ef.golpes.push({ ...g, t: lista.ahora() });
      if (!g.entra) return;
      if (!anf?.herir) { apuntar(d.comando, "el anfitrión no tiene por dónde recibir daño"); return; }
      anf.herir({ dano: g.dano, tipo: g.tipo, acierto: g.acierto, atacante, infligidor, comando: d.comando });
    },

    /**
     * `*playermessage <ent> …` — el motor sólo escribe a jugadores
     * (`ScriptCmd_Message`, scriptcmds.cpp:4243). Aquí el único jugador con
     * pantalla es el anfitrión, si lo es; lo que vaya al aplicador u otro no
     * llega a ninguna pantalla de este navegador.
     */
    mensajeAlJugador(aQuien, texto, cual) {
      if (esYo(aQuien) && anf?.esJugador) base.mensajeAlJugador(aQuien, texto, cual);
    },

    /** `givehp`: sin objetivo, o con el anfitrión, cura al anfitrión. */
    dar(que, ref, cantidad) {
      if (ref === null || ref === undefined || esYo(ref)) { base.dar(que, ref ?? null, cantidad); return; }
      apuntar("givehp", "a otra entidad");
    },

    llamarExterno(ref, nombre, params = []) {
      if (esYo(ref)) { anf?.llamar?.(String(nombre), params.map(String)); return; }
      apuntar("callexternal", `${ref} ${nombre}`);
    },

    /** Un efecto que pone otro efecto: `effect_spiderlatch` pone `dot_poison`. */
    aplicarEfecto(ref, ruta, params = []) {
      if (!esYo(ref)) { apuntar("applyeffect", `${ref} ${ruta} (objetivo sin guion)`); return null; }
      return lista.aplicar(ruta, params, {
        aplicador: { id: String(anf?.id?.() ?? "0"), propiedad: (p, x) => lista.propiedadDelAnfitrion(p, x) },
        // El 91: el efecto nuevo conoce a quien conocía éste.
        conocidos: [ef.aplicador, ...ef.conocidos].filter(Boolean),
      });
    },
    quitarEfecto(ref, id) {
      if (!esYo(ref)) { apuntar("removeeffect", `${ref} ${id} (objetivo sin guion)`); return 0; }
      return lista.quitarPorId(id);
    },
    quitarGuion() { ef.quitarse(); },
  };
}
