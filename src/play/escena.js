// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  EL DIRECTOR DE ESCENAS DE LOS NPC — `ms_npcscript`, los cinco tipos      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// `NPCScript`, `monsters/npcact.cpp`. Es el `scripted_sequence` de Master
// Sword: coge al NPC que nombra su `target` y le hace **una de cinco cosas**.
//
//     enum { SCRIPT_MOVE = 0, SCRIPT_PLAYANIM, SCRIPT_RUNEVENT,
//            SCRIPT_MOVE_PLAYANIM, SCRIPT_MOVE_RUNEVENT };   npcact.cpp:17-23
//
// Dos clases del mod entran por aquí, y son la misma de C++:
//
//     LINK_ENTITY_TO_CLASS(ms_npcscript, NPCScript);   npcact.cpp:54
//     LINK_ENTITY_TO_CLASS(mstrig_act,   NPCScript);   npcact.cpp:55
//
// ── LA CUENTA, QUE ES LO QUE DECIDE QUÉ SE PORTA ────────────────────────────
//
// Medido sobre los 81 mapas de `../MSC/assets/msr/maps` (`npm test`, el bloque
// «el censo de los cinco tipos» de `test/escena77.test.mjs`, que lo cuenta y no
// lo copia de aquí):
//
//     | tipo | qué hace                       | cuántos en el juego |
//     |    0 | SCRIPT_MOVE: anda hasta aquí   |  98  ← el más común |
//     |    1 | SCRIPT_PLAYANIM: pone una anim |  15                 |
//     |    2 | SCRIPT_RUNEVENT: lanza evento  |  47                 |
//     |    3 | MOVE + PLAYANIM                |  10                 |
//     |    4 | MOVE + RUNEVENT                |   2                 |
//                                      172 en 30 mapas de 81
//
// El 67 portó el **2**, que son 15 de los 18 de Edana. Lo que trae este archivo
// son los otros cuatro, y con ellos el que más hay de todos: **el 0, 98 de los
// 172**, que es el que no estaba.
//
// Edana tiene `{0: 2, 2: 15, 4: 1}` y **Gate City no tiene ninguno**: octava vez
// que el hueco lo enseña el segundo mapa (ver el apartado 4 de CLAUDE.md).
//
// EL 78: los tipos 1 y 3, que el 77 dejó escritos y PENDIENTES por no tener
// caso, se miden desde `gertenheld_forest2` —tercer mapa portado, dos del tipo
// 1 y una del 3, las tres a pie del jugador— en `sondas/gertenheld78.mjs`.
//
// ── LAS DOS RAMAS DEL TIPO 2, Y POR QUÉ UNA ESTÁ MUERTA ─────────────────────
//
// `Act` lo despacha DOS veces. La primera es un parche de Thothie:
//
//     if (m_iType == SCRIPT_RUNEVENT) { RunScriptEvent(); return; }
//                                                        npcact.cpp:138-144
//
// y la segunda, veinticinco líneas más abajo, no se alcanza nunca:
//
//     else if (m_iType == SCRIPT_RUNEVENT) { RunScriptEvent(); }  :174-177
//
// No es cosmético: el `return` de la primera **se salta el
// `pMonster->m_MonsterState = MONSTERSTATE_SCRIPT` del final** (:181), así que
// lanzar un evento NO congela al NPC y poner una animación SÍ. Si fuera por la
// segunda rama, el sacerdote se quedaría clavado después de saludarte. El
// comentario de Thothie está al lado: «attempting to fix buggy ms_npcscript
// behavior».
//
// ── TRES FALLOS DEL MOD QUE SE PORTAN CON EL FALLO PUESTO ───────────────────
//
// (El tercero está donde se nota, en `_pensarAndando`: `setmovedest none` hace
// que una escena del mapa se crea que el NPC ha llegado, porque apaga la
// condición y deja el destino escrito.)
//
// 1. **`Finish(bool)` se come su argumento.**
//
//        void Finish(bool fEarlyBreak) { m_EarlyBreak = true; Finish(); }
//                                                        npcact.cpp:32-36
//
//    El parámetro no se lee: lo pone a `true` y punto. Da igual porque los dos
//    sitios que lo llaman le pasan `true` (`:226`, `:232`), pero está escrito
//    así y así se porta: `_acabar(true)` aquí tampoco mira el valor.
//
// 2. **`m_EarlyBreak` no se vuelve a poner a `false` en ningún sitio.** No está
//    en `Spawn` (`:57-62`, que sólo toca `effects`, el `Use` y
//    `m_fShouldExpire`) ni en `Act` ni en `FireTarget`. Así que una escena que
//    se corta UNA vez se queda marcada **para el resto de la partida**: a
//    partir de ahí dispara su `fireonbreak` incluso cuando acaba bien, y su
//    `firedelay` deja de respetarse (`if (m_flFireDelay && !m_EarlyBreak)`,
//    `:295`). Y se corta con cualquiera: basta que otro le cambie el destino al
//    NPC mientras anda (`:229`).
//
//    Esto no es teórico en Edana. El guion de Edrin hace su propio
//    `setmovedest HOME_LOC 5` (`edana/edrin.script:168`) mientras `edrinspot`
//    lo lleva a su sitio: dos mecanismos sobre la misma casilla. Ver el
//    apartado 2 de doc/ESCENAS_77.md.
//
// ── LO QUE NO ESTÁ AQUÍ, DICHO AQUÍ ────────────────────────────────────────
//
//   - **El grafo de nodos.** El motor rodea obstáculos con quince rumbos al
//     azar (`msmonsterserver.cpp:1081`); aquí se anda recto y, si se choca, se
//     para. Lo dice ya `Manada.avanzarHacia` y sigue siendo verdad: feo, y no
//     finge ser otra cosa.
//   - **`AnimateThink` recoloca al NPC sobre su hueso 0** si la animación lo ha
//     movido más de ocho unidades (`npcact.cpp:277-287`). Las posiciones de
//     hueso no se leen en este puerto; el tipo 1 y el 3 acaban sin ese
//     reajuste, y se cuenta en `apuntar("escena: sin recolocar al hueso")`.
//   - **`MONSTER_NOAI`** (`stopai`) se pide al mundo, que es quien tiene la IA.
//     Ninguno de los tres de Edana lo trae.

/** `enum` de `npcact.cpp:17-23`, con sus nombres. */
export const TIPO = {
  MOVER: 0,
  ANIMAR: 1,
  EVENTO: 2,
  MOVER_Y_ANIMAR: 3,
  MOVER_Y_EVENTO: 4,
};

/**
 * ¿Este tipo manda andar al NPC?
 *
 *     if (m_iType == SCRIPT_MOVE || m_iType == SCRIPT_MOVE_PLAYANIM ||
 *         m_iType == SCRIPT_MOVE_RUNEVENT)                 npcact.cpp:147-149
 */
export function mueve(tipo) {
  const t = Number(tipo) || 0;
  return t === TIPO.MOVER || t === TIPO.MOVER_Y_ANIMAR || t === TIPO.MOVER_Y_EVENTO;
}

/**
 * LA DISTANCIA A LA QUE SE DA POR LLEGADO.
 *
 *     virtual float GetDefaultMoveProximity() { return m_Width * 1.1; }
 *                                                        msmonster.h:355
 *
 * `m_Width` es el `width` del guion del NPC. El horneado ya lo deja calculado
 * en `cercaniaDeDestino` (`src/bsp/script.js:696`) y esto es la misma cuenta
 * para quien tenga sólo el ancho: **se calcula, no se escribe** (apartado 5 de
 * CLAUDE.md).
 */
export function proximidadDe(ancho) {
  const a = Number(ancho);
  return Number.isFinite(a) && a > 0 ? a * 1.1 : null;
}

/**
 * ¿YA ESTÁ CERCA? — `CMSMonster::SetMoveDest`, msmonsterserver.cpp:1014-1018.
 *
 *     m_vecTarget = m_MoveDest.Origin - EyePosition();
 *     if ((IsFlying() ? m_vecTarget.Length() : m_vecTarget.Length2D())
 *         <= m_MoveDest.Proximity)
 *
 * Tres cosas que no se adivinan:
 *
 *   1. **Se mide desde el OJO, no desde el origen** — y para quien anda da
 *      igual, porque `Length2D` tira la componente vertical y el ojo está justo
 *      encima del origen. Para quien vuela NO da igual: ahí es `Length()` y la
 *      altura del ojo entra en la cuenta. Las dos ramas están escritas porque
 *      son dos reglas, no una con un caso de prueba — y la de volar no tiene
 *      caso en Edana, así que su control va declarado como pendiente y no
 *      contado entre los verdes (apartado 4 de CLAUDE.md, la variante del 50).
 *   2. **El `<=` es `<=`**, así que estar exactamente a la distancia de
 *      proximidad ya es haber llegado.
 *   3. LOS EJES, que es donde esto se rompe sin dar un error.
 *
 *      `Vector::Length2D()` es `sqrt(x*x + y*y)` y en GoldSrc **la altura es la
 *      Z**: lo que tira es la Z. En este puerto los puntos van en unidades pero
 *      con los ejes de Three —`aEscena` es `[x/U, z/U, -y/U]`,
 *      `src/bsp/lector.js:402`— o sea que **la altura es la Y** y el plano del
 *      suelo es X-Z. Así que aquí se tira la Y, no la Z.
 *
 *      Se trabaja en el convenio del puerto a propósito y no en el del motor:
 *      hay un solo sitio donde cambiar de ejes y ya existe. Meter un segundo
 *      convenio en este archivo daría una distancia que mezcla la altura con la
 *      horizontal y un NPC que se da por llegado desde un tejado — sin error.
 *
 *      Las unidades sí son las del `.bsp`: lo que se divide por `U` es el paso
 *      del movimiento, no esto. Aquí no se divide por nada.
 */
export function haLlegado({ destino, ojo, proximidad, vuela = false } = {}) {
  if (!Array.isArray(destino) || !Array.isArray(ojo)) return false;
  const p = Number(proximidad);
  if (!Number.isFinite(p)) return false;
  const dx = destino[0] - ojo[0];
  const alto = destino[1] - ojo[1];
  const dz = destino[2] - ojo[2];
  // `IsFlying() ? Length() : Length2D()`. La Y es la altura en este convenio.
  return (vuela ? Math.hypot(dx, alto, dz) : Math.hypot(dx, dz)) <= p;
}

/**
 * UNA ESCENA CORRIENDO.
 *
 * El motor es una entidad con `SetThink` y `nextthink`; aquí es una entrada de
 * esta lista con su `fase` y su `cuando`. Las fases son exactamente los cuatro
 * `Think` del archivo más el retraso de `Finish`:
 *
 *     MoveThink      npcact.cpp:220    `andando`
 *     AnimateThink   npcact.cpp:265    `animando`
 *     Finish         npcact.cpp:293    `esperandoElDisparo`  (sólo con firedelay)
 *
 * `cuando` es el `pev->nextthink`: el motor piensa cada **0,1 s** y eso se
 * respeta, porque un paso más fino haría que el NPC llegase antes que en el
 * juego. El 72 ya avisó de que una décima no se mide desde un `evaluate`: la
 * miden las pruebas de Node, que avanzan el paso ellas mismas.
 */
const PASO_DE_PENSAR = 0.1;             // `pev->nextthink = time + 0.1`

/**
 * EL DIRECTOR.
 *
 * `mundo` es lo que este módulo no puede saber —quién está vivo, dónde está,
 * qué animación tiene— y va inyectado, no importado: es lo que permite probar
 * esto en Node sin montar el juego, y es lo que obliga a que el juego pase por
 * la misma puerta que las pruebas.
 *
 * Ninguno de los ganchos tiene valor por omisión que «funcione»: el que falte
 * hace que la escena se niegue a empezar y lo diga. Un `=> {}` de relleno es
 * el sitio donde una regla vive sin correr, y eso ya ha pasado aquí al lado:
 * `irA` era exactamente eso desde el 43 (apartado 4 de CLAUDE.md).
 */
export class Escenas {
  /**
   * @param reloj     `() => gpGlobals->time`, en segundos.
   * @param npcPorNombre  `UTIL_FindEntityByTargetname` + `FL_MONSTER`
   *                  (`npcact.cpp:76-79`). Devuelve el asa de un NPC o `null`.
   * @param disparar  `FireTargets(nombre, pMonster, this, USE_TOGGLE, 0)`
   *                  (`npcact.cpp:320`). **El activador es el NPC**, no quien
   *                  disparó la escena.
   * @param apuntar   dónde se cuenta lo que no llega. Sin él no se cuenta nada,
   *                  que es peor que contarlo mal.
   */
  constructor({ reloj = null, npcPorNombre = null, disparar = null, apuntar = null } = {}) {
    this.reloj = reloj;
    this.npcPorNombre = npcPorNombre;
    this.disparar = disparar;
    this.apuntar = apuntar;
    /** Las escenas vivas. Una entidad del mapa puede tener varias: ver `_duplicar`. */
    this.vivas = [];
    /** Por entidad del mapa, su estado persistente. `m_EarlyBreak` vive aquí. */
    this.estados = new Map();
    /** Para las sondas: qué ha pasado, en orden. */
    this.diario = [];
  }

  /** `gpGlobals->time`. Sin reloj no hay escena: se dice en vez de inventar un cero. */
  _ahora() {
    const t = this.reloj?.();
    return Number.isFinite(t) ? t : null;
  }

  _apuntar(motivo) { this.apuntar?.(motivo); return motivo; }

  /**
   * El estado que sobrevive entre disparos de la MISMA entidad del mapa.
   *
   * `m_EarlyBreak` y `m_NPC` son campos de la entidad, no de la llamada, y de
   * eso depende el fallo 2 de la cabecera: si esto se creara por disparo, la
   * marca de «se cortó» se borraría sola y el fallo del mod no se portaría.
   */
  _estado(id) {
    if (!this.estados.has(id)) {
      this.estados.set(id, {
        // `m_EarlyBreak`, que NO se vuelve a poner a false en ningún sitio.
        cortada: false,
        // `m_NPC.Entity()`: a quién tiene cogido. Es lo que hace que la segunda
        // llamada duplique en vez de rechazar (`npcact.cpp:88-113`).
        ocupadaCon: null,
        disparos: 0,
      });
    }
    return this.estados.get(id);
  }

  /**
   * `NPCScript::Act` — npcact.cpp:63-181.
   *
   * `e` es la entidad del mapa tal y como la hornea `tools/gatecity.mjs`:
   * `{ i, clase, nombre, tipo, npc, eventoDelNpc, animDeAndar, animDeAccion,
   *    alAcabar, alCortarse, retrasoAlAcabar, paraLaIa, origen, angulos }`.
   *
   * Devuelve `null` si la escena ha arrancado, o el motivo por el que no — que
   * el llamador cuenta. Los motivos son los `return` del motor, uno por uno.
   */
  empezar(e, activador = null) {
    const ahora = this._ahora();
    if (ahora === null) return this._apuntar("escena: sin reloj");
    const estado = this._estado(e.i);
    const tipo = Number(e.tipo) || 0;

    // `pMonster = UTIL_FindEntityByTargetname(NULL, STRING(pev->target))`, y
    // `if (!pMonster || !FBitSet(pMonster->pev->flags, FL_MONSTER)) return;`
    //                                                      npcact.cpp:76-79
    //
    // Se busca por `target` SIEMPRE, también cuando hay activador: la rama del
    // activador (`:71-75`) sólo lo acepta si se llama como el `target`, así que
    // el nombre manda en los dos caminos y aquí se resuelve una vez.
    if (!e.npc) return this._apuntar("escena: sin `target`");
    const npc = this.npcPorNombre?.(String(e.npc)) ?? null;
    if (!npc) return this._apuntar("escena: el NPC no existe");

    // `if (!pMonster->IsAlive()) return;` — dos veces, :83 y :123.
    if (!npc.vivo) return this._apuntar("escena: el NPC está muerto");

    // ── OCUPADA: SE DUPLICA, NO SE RECHAZA ─────────────────────────────────
    //
    //     if (m_NPC.Entity()) { ...crea un NPCScript nuevo y le pasa el
    //                             relevo con m_fShouldExpire = true... }
    //                                                     npcact.cpp:88-113
    //
    // Es el hermano del clon del `multi_manager` del 67: el original se queda
    // ocupado y el trabajo lo hace una copia que se borra al acabar
    // (`DelayedRemove`, :322-323). Aquí la copia es otra entrada de `vivas`
    // con `copia: true`, y el `m_fShouldExpire` es justo eso.
    //
    // **La copia se salta todas las guardas de arriba** (`else { pMonster =
    // (CBaseEntity *)pActivator; }`, :115-119) porque ya las pasó el original.
    if (estado.ocupadaCon) {
      // «Calling monster must have the correct targetname» (:91-93): sin
      // activador que se llame como el `target`, no se duplica — se calla.
      if (!activador || String(activador) !== String(e.npc)) {
        return this._apuntar("escena: ocupada y sin activador con su nombre");
      }
      return this._arrancar(e, npc, estado, tipo, ahora, { copia: true, activador });
    }

    // `if (pMonster->m_MonsterState == MONSTERSTATE_SCRIPT) return;` — :128.
    // «Don't stop a monster already in a script».
    if (npc.enEscena) return this._apuntar("escena: el NPC ya está en una escena");

    // `if (!m_fStopAI && pMonster->m_hEnemy != NULL) return;` — :131.
    // «Don't stop an attacking monster». Es la guarda que se nota: un vecino
    // al que están pegando no te atiende si el mapa no puso `stopai`.
    if (!e.paraLaIa && npc.enemigo) return this._apuntar("escena: el NPC está peleando");

    return this._arrancar(e, npc, estado, tipo, ahora, { copia: false, activador });
  }

  /** Lo que `Act` hace una vez pasadas las guardas. npcact.cpp:138-181. */
  _arrancar(e, npc, estado, tipo, ahora, { copia, activador }) {
    estado.disparos++;
    estado.ocupadaCon = String(e.npc);

    const escena = {
      e, npc, estado, tipo, copia, activador,
      // El destino que ESTA escena ha puesto, para el `m_MoveDest != m_MoveDest`
      // de `MoveThink`. Se guarda el que se pidió, no el que tenga el NPC.
      destino: null,
      proximidad: null,
      fase: null,
      cuando: ahora,
    };

    // ── EL TIPO 2, POR LA PRIMERA RAMA Y CON SU `return` ───────────────────
    // `if (m_iType == SCRIPT_RUNEVENT) { RunScriptEvent(); return; }` :138-144
    //
    // El `return` se salta el `MONSTERSTATE_SCRIPT` de :181: lanzar un evento
    // no congela al NPC. Esta rama es la del 67 y sigue siendo la que corre.
    if (tipo === TIPO.EVENTO) {
      this.vivas.push(escena);
      this._lanzarEvento(escena);
      return null;
    }

    if (mueve(tipo)) {
      // `m_MoveDest.Origin = pev->origin;` — el destino es DÓNDE ESTÁ la
      // entidad `ms_npcscript`, no un `target` suyo. :151
      const destino = Array.isArray(e.origen) ? [...e.origen] : null;
      if (!destino) { estado.ocupadaCon = null; return this._apuntar("escena: sin origen"); }
      // `m_MoveDest.Proximity = pMonster->GetDefaultMoveProximity();` :152
      const proximidad = npc.proximidad ?? proximidadDe(npc.ancho);
      if (!Number.isFinite(proximidad)) {
        estado.ocupadaCon = null;
        return this._apuntar("escena: el NPC no tiene `width`");
      }
      escena.destino = destino;
      escena.proximidad = proximidad;
      // `pMonster->m_MoveDest = m_MoveDest; SetConditions(MONSTER_HASMOVEDEST);`
      // `m_Activity = ACT_WALK; pMonster->m_hEnemy = this;`        :154-159
      //
      // `m_hEnemy = this` no es un error de lectura: el motor usa la casilla del
      // enemigo para que el NPC mire al sitio. Es lo que luego deshace
      // `FireTarget` (`if (pMonster->m_hEnemy == this) m_hEnemy = NULL;`, :311).
      npc.mandarA({
        destino, proximidad,
        // `if (m_sMoveAnim) SetAnimation(MONSTER_ANIM_WALK, m_sMoveAnim);` :164-165
        anim: e.animDeAndar ?? null,
        // `if (m_fStopAI) SetConditions(MONSTER_NOAI);` :156-157
        paraLaIa: Boolean(e.paraLaIa),
        dueño: escena,
      });
      escena.fase = "andando";
      escena.cuando = ahora + PASO_DE_PENSAR;
      // `pMonster->m_MonsterState = MONSTERSTATE_SCRIPT;` :181
      npc.ponerEnEscena(true);
      this.vivas.push(escena);
      this._anotar(escena, "anda", { destino, proximidad, anim: e.animDeAndar ?? null });
      return null;
    }

    if (tipo === TIPO.ANIMAR) {
      this.vivas.push(escena);
      npc.ponerEnEscena(true);                            // :181
      this._ponerAnimacion(escena, ahora);
      return null;
    }

    // `else return;` — un `type` que no es ninguno de los cinco no hace nada
    // y tampoco deja al NPC en escena, porque el `return` está antes de :181.
    estado.ocupadaCon = null;
    return this._apuntar(`escena: tipo ${tipo} no existe`);
  }

  /** `NPCScript::PlayAnim` — npcact.cpp:183-204. */
  _ponerAnimacion(escena, ahora) {
    const { npc, e } = escena;
    // `if (!pMonster || !pMonster->IsAlive()) { Finish(); return; }` :186-190
    if (!npc.vivo) { this._acabar(escena, false); return; }
    // `m_Activity = ACT_IDLE; pev->angles = pev->angles del script;` :192-193
    npc.animacionDeReposo();
    if (Array.isArray(e.angulos)) npc.mirar([...e.angulos]);
    if (e.animDeAccion) {
      // `SetAnimation(MONSTER_ANIM_BREAK)` y luego `MONSTER_ANIM_ONCE`. :197-198
      npc.animar(String(e.animDeAccion), { unaVez: true });
    }
    // Lo que NO se porta: `pev->frame = 0` y `m_fSequenceFinished = FALSE`
    // (:200-201) son del mezclador del motor, y el reajuste al hueso 0 de
    // `AnimateThink` necesita posiciones de hueso que este puerto no lee.
    this._apuntar("escena: sin recolocar al hueso");
    escena.fase = "animando";
    escena.cuando = ahora + PASO_DE_PENSAR;               // :202-203
    this._anotar(escena, "anima", { anim: e.animDeAccion ?? null });
  }

  /** `NPCScript::RunScriptEvent` — npcact.cpp:205-219. */
  _lanzarEvento(escena) {
    const { npc, e } = escena;
    if (!npc.vivo) { this._acabar(escena, false); return; }
    // `pMonster->CallScriptEvent(STRING(m_sEventName))` — :214. **Sin
    // parámetros**: ni el jugador que la disparó. Los eventos de detrás están
    // escritos para eso.
    const contesto = e.eventoDelNpc ? Boolean(npc.evento(String(e.eventoDelNpc))) : false;
    this._anotar(escena, "evento", { evento: e.eventoDelNpc ?? null, contesto });
    // `Finish();` — :218. Sin `SetThink`: el tipo 2 acaba en el acto.
    this._acabar(escena, false);
  }

  /**
   * UN PASO DEL RELOJ. Es el `nextthink` del motor, no un bucle de fotograma:
   * lo que no haya vencido no se toca.
   */
  paso() {
    const ahora = this._ahora();
    if (ahora === null) return 0;
    // Una copia, porque `_acabar` saca de `this.vivas` y `_arrancar` mete.
    const vencidas = this.vivas.filter((s) => s.fase && s.cuando <= ahora);
    for (const s of vencidas) {
      if (!this.vivas.includes(s)) continue;              // la ha cerrado otra
      if (s.fase === "andando") this._pensarAndando(s, ahora);
      else if (s.fase === "animando") this._pensarAnimando(s, ahora);
      else if (s.fase === "esperandoElDisparo") this._disparar(s);
    }
    return vencidas.length;
  }

  /** `NPCScript::MoveThink` — npcact.cpp:220-263. */
  _pensarAndando(escena, ahora) {
    const { npc } = escena;
    // `if (!pMonster || !pMonster->IsAlive()) { Finish(true); return; }` :223-227
    if (!npc.vivo) { this._acabar(escena, true); return; }

    // ── EL CORTE: OTRO LE HA CAMBIADO EL DESTINO ───────────────────────────
    //
    //     if (pMonster->m_MoveDest != m_MoveDest) { Finish(true); return; }
    //                                                      npcact.cpp:229-233
    //
    // Es la puerta por la que entra el fallo 2 de la cabecera, y en Edana la
    // abre el propio guion de Edrin con su `setmovedest HOME_LOC 5`.
    // Son DOS COSAS SEPARADAS en el motor y hay que preguntarlas por separado:
    //
    //   `destinoActual()`  el `dest_t` guardado — `m_MoveDest`, que **no se
    //                      borra nunca**: `StopWalking` apaga la condición y
    //                      deja el valor escrito (msmonsterserver.cpp:1407)
    //   `tieneDestino()`   la condición `MONSTER_HASMOVEDEST`
    //
    // Mezclarlas cambia el resultado, y de ahí sale el tercer fallo del mod que
    // este archivo porta: **`setmovedest none` hace que la escena del mapa se
    // crea que el NPC ha llegado.**
    //
    //     if (Params[0] == "none") { StopWalking();
    //                                ClearConditions(MONSTER_HASMOVEDEST); }
    //                                                 npcscript.cpp:1608-1612
    //
    // No toca `m_MoveDest`, así que la comparación de :229 sigue dando iguales
    // y el `if` de :238 se cumple: el `ms_npcscript` pone la animación de
    // reposo, le gira la cara al rumbo del mapa y **sigue a su rama de acabar
    // como si hubiera llegado**, con el NPC donde estuviera. En Edana eso lo
    // dispara el `check_home_loop` de Edrin (`edana/edrin.script:178`).
    const suyo = npc.destinoActual();
    if (!mismoDestino(suyo, { origen: escena.destino, proximidad: escena.proximidad })) {
      this._acabar(escena, true);
      return;
    }

    // `m_NextNodeTime = m_NodeCancelTime = time + 2.0;` — :234
    //
    // Cada 0,1 s se rearman los dos relojes del paseo, así que **mientras una
    // escena corre el NPC no se va a pasear por su cuenta**, y tampoco se le
    // vence el plazo de los siete segundos que suelta un destino de paseo.
    npc.aplazarElPaseo(ahora + 2.0);
    escena.cuando = ahora + PASO_DE_PENSAR;               // :236

    // `if (!pMonster->HasConditions(MONSTER_HASMOVEDEST))` — ha llegado. :238
    //
    // «Ha llegado» para esta entidad es que la CONDICIÓN esté apagada, y la
    // apaga `StopWalking` desde `SetMoveDest` al entrar en la proximidad
    // (msmonsterserver.cpp:1026). Quien de verdad mide la distancia es
    // `haLlegado`, arriba, y lo hace el mundo en su paso de movimiento: esta
    // entidad no mide nada, sólo mira la bandera. Es importante para no medir
    // dos veces con dos cuentas distintas, que es como se acaba teniendo un
    // NPC que la escena cree llegado y el movimiento no.
    if (npc.tieneDestino()) return;

    // La animación de estar parado, que es `m_IdleAnim` si lo tiene y
    // `SetActivity(ACT_IDLE)` si no. :241-247
    npc.animacionDeReposo();
    // Y EL RUMBO FINAL ES EL DE LA ENTIDAD DEL MAPA, no el de la marcha.
    //
    //     pMonster->pev->angles = pev->angles;                        :249
    //
    // `SetMoveDest` ya había puesto el NPC mirando AL DESTINO al llegar
    // (`msmonsterserver.cpp:1021-1023`); esta línea lo sobrescribe con el
    // `angles` del `ms_npcscript`. Son dos rumbos distintos y el que queda es
    // el segundo: por eso Edrin acaba mirando a 270° y no al punto desde el que
    // vino.
    if (Array.isArray(escena.e.angulos)) npc.mirar([...escena.e.angulos]);

    // `switch (m_iType)` — :251-261.
    if (escena.tipo === TIPO.MOVER_Y_ANIMAR) { this._ponerAnimacion(escena, ahora); return; }
    if (escena.tipo === TIPO.MOVER_Y_EVENTO) { this._lanzarEvento(escena); return; }
    this._acabar(escena, false);                          // `default: Finish();`
  }

  /** `NPCScript::AnimateThink` — npcact.cpp:265-291. */
  _pensarAnimando(escena, ahora) {
    const { npc } = escena;
    if (!npc.vivo) { this._acabar(escena, false); return; }   // :268-272
    escena.cuando = ahora + PASO_DE_PENSAR;                   // :274
    // `if (pMonster->m_fSequenceFinished)` — :276. El reajuste al hueso 0 que
    // viene después no se porta; está contado al poner la animación.
    if (npc.secuenciaAcabada()) this._acabar(escena, false);
  }

  /**
   * `NPCScript::Finish` — npcact.cpp:293-302.
   *
   * `cortada` es el `fEarlyBreak`, y aquí se repite el fallo 1 del mod: el
   * motor **no lee su parámetro**, pone `m_EarlyBreak = true` y llama a
   * `Finish()`. Así que esto tampoco pregunta por `cortada` para decidir si
   * marcar: marca si le han llamado desde una rama de corte, que son las dos
   * `Finish(true)` de `MoveThink`. El efecto es idéntico porque esos son los
   * únicos sitios que pasan algo.
   */
  _acabar(escena, cortada) {
    if (cortada) escena.estado.cortada = true;            // y nunca se desmarca
    const ahora = this._ahora();
    const retraso = Number(escena.e.retrasoAlAcabar) || 0;
    // `if (m_flFireDelay && !m_EarlyBreak) { SetThink(FireTarget); nextthink
    //  = time + m_flFireDelay; } else FireTarget();`                :295-301
    //
    // Nótese que el que decide es `m_EarlyBreak`, el campo que no se limpia: una
    // escena que se cortó alguna vez pierde su retraso para siempre.
    if (retraso > 0 && !escena.estado.cortada) {
      escena.fase = "esperandoElDisparo";
      escena.cuando = (ahora ?? 0) + retraso;
      this._anotar(escena, "espera", { retraso });
      return;
    }
    this._disparar(escena);
  }

  /** `NPCScript::FireTarget` — npcact.cpp:303-324. */
  _disparar(escena) {
    const { npc, e, estado } = escena;
    // `ClearConditions(MONSTER_NOAI); m_MonsterState = MONSTERSTATE_NONE;`
    // `if (m_hEnemy == this) m_hEnemy = NULL; m_NPC = NULL;`         :307-313
    if (npc) {
      npc.ponerEnEscena(false);
      npc.soltarLaEscena(escena);
    }
    estado.ocupadaCon = null;
    escena.fase = null;
    this.vivas = this.vivas.filter((s) => s !== escena);

    // `string_t FireEvent = m_EarlyBreak ? m_sFireOnBreak : m_sFireWhenDone;`
    //                                                               :318
    const objetivo = estado.cortada ? e.alCortarse : e.alAcabar;
    this._anotar(escena, "acaba", { cortada: estado.cortada, dispara: objetivo ?? null });
    if (objetivo) {
      // `FireTargets(STRING(FireEvent), pMonster, this, USE_TOGGLE, 0);` :320
      // **El activador es el NPC.** Aquí el NPC es un nombre, así que se pasa
      // tal cual y lo resuelve el mundo — igual que hace el tipo 2 desde el 67.
      this.disparar?.(String(objetivo), String(e.npc));
    }
    // `if (m_fShouldExpire) DelayedRemove();` — :322-323. La copia se va; la
    // entidad del mapa se queda, con su `cortada` puesta si lo estaba.
    if (escena.copia) this.estados.delete(`${e.i}:copia`);
  }

  _anotar(escena, que, datos = {}) {
    this.diario.push({
      que, entidad: escena.e.i, nombre: escena.e.nombre ?? null,
      tipo: escena.tipo, npc: escena.e.npc ?? null, copia: escena.copia, ...datos,
    });
    if (this.diario.length > 400) this.diario.shift();
  }

  /** Para las sondas: qué hay corriendo ahora mismo. */
  censo() {
    return this.vivas.map((s) => ({
      entidad: s.e.i, nombre: s.e.nombre ?? null, tipo: s.tipo, npc: s.e.npc ?? null,
      fase: s.fase, cuando: s.cuando, copia: s.copia,
      destino: s.destino ? [...s.destino] : null, proximidad: s.proximidad,
      cortada: s.estado.cortada, disparos: s.estado.disparos,
    }));
  }
}

/**
 * `pMonster->m_MoveDest != m_MoveDest` — el `operator!=` de `dest_t`.
 *
 *     struct dest_t {
 *         Vector Origin;
 *         float Proximity;
 *         entityinfo_t MoveTarget;
 *         bool operator==(dest_t &a)
 *             { return Origin == a.Origin && Proximity == a.Proximity; }
 *         bool operator!=(dest_t &a) { return !operator==(a); }
 *     };                                               msmonster.h:16-23
 *
 * Dos cosas, y las dos importan para el corte de `MoveThink`:
 *
 *   1. **Compara el punto Y la proximidad.** Un `setmovedest HOME_LOC 5` al
 *      mismísimo punto al que apunta el `ms_npcscript` seguiría cortando la
 *      escena, porque la proximidad del guion es 5 y la del mapa es
 *      `width * 1.1`. En Edana son 5 contra 35,2: dos destinos distintos.
 *   2. **NO compara `MoveTarget`**, el asa de la entidad a la que se va. Así
 *      que es una comparación por VALOR: quien ponga el mismo punto con la
 *      misma proximidad no corta nada, venga de donde venga.
 */
export function mismoDestino(a, b) {
  if (!a || !b) return !a && !b;
  const pa = a.origen, pb = b.origen;
  if (!Array.isArray(pa) || !Array.isArray(pb)) return false;
  if (pa.length !== pb.length || !pa.every((v, k) => v === pb[k])) return false;
  // `Proximity == a.Proximity`, y es un `float`: se compara igual que el motor.
  return Number(a.proximidad) === Number(b.proximidad);
}
