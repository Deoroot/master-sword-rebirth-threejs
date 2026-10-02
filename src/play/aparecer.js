// LAS ÁREAS DE APARICIÓN: `CAreaMonsterSpawn`, msmapents.cpp:1320-1321.
//
// Esto es lo que faltaba para que Gate City fuera Gate City, y llevaba mal desde
// el experimento 07 sin que nada diera error. **38 de las 69 entidades de bicho
// del mapa no son monstruos**: son la ficha que usa un área, y el motor las borra
// en cuanto las registra.
//
//   CMSMonster::Spawn     if (m_iszMonsterSpawnArea.len()) {
//                           SetBits(pev->effects, EF_NODRAW); return; }   :228-232
//   CMSMonster::Activate  pSpawnArea->m_pGoalEnt = this; pSpawnArea->Activate();
//                         if (!m_fSpawnOnTrigger) SUB_Remove();           :119-129
//
// Y son **todos los hostiles** de Gate City: los 8 goblins, los 22 enanos zombi,
// las 3 arañas, el cofre del tesoro y las 4 crías. Colocarlos a los 69 de pie al
// arrancar se ve casi igual que hacerlo bien —están en el mismo sitio— y esconde
// las dos cosas que sí se notan jugando:
//
//   1. **no están al entrar**: el área piensa por primera vez a los 3 segundos
//      (`pev->nextthink = pev->ltime + 3.0`, msmapents.cpp:744) y luego saca uno
//      cada 0,2 s (`flNextSpawnTime = gpGlobals->time + 0.2`, :1213);
//   2. **vuelven al matarlos**, que es el «monster respawn» que el README lleva
//      apuntado como pendiente. De 1-2 s en las bolsas de crías a 300-500 s en
//      los goblins, y hasta agotar las vidas.
//
// ── Lo que no se adivina, y son cuatro cosas ──────────────────────────────
//
// 1. **Cero vidas significa infinitas.** `if (!m_Lives) m_Lives = -1; //zero ==
//    infinite lives` (msmonsterserver.cpp:202-203). 16 de las 38 no dicen `lives`,
//    o sea que vuelven para siempre. Leerlo como «cero vidas, no vuelve» da un
//    pueblo que se vacía solo y tarda veinte minutos en notarse.
//
// 2. **El sitio no se sortea casi nunca.** `spawnloc` 1 es al azar dentro del
//    volumen; el 0 es fijo y es el valor por omisión. **Ninguna de las 16 áreas de
//    Gate City lo dice**, así que las 16 son fijas y el bicho sale en el origen de
//    su propia plantilla. Los nueve volúmenes con brushes no eligen nada: el área
//    es sólo quien lleva el reloj.
//
// 3. **La primera vez no hay espera.** `mdSpawnMonster[i].delayvalue = 0` al
//    registrar, con su comentario en el motor: «Monsters now spawn immediately the
//    FIRST time. The respawn delay only affects respawns...» (:1092-1094).
//
// 4. **La probabilidad se compara contra `RANDOM_FLOAT(0, 99)`**, no contra 100:
//    `if (RANDOM_FLOAT(0, 99) > spawnchance)` (:1214). Con `spawnchance 100` —que
//    es lo que dicen las 38 de Gate City— **nunca falla**, así que ese camino no
//    se ejerce en este mapa. Se porta igual, con una prueba que lo ejerce a mano,
//    porque si no sería código muerto y sin comprobar.
//
// ── Lo que NO se porta, dicho aquí y no descubierto luego ─────────────────
//
// `nplayers` (mínimo de jugadores), `hpreq_min`/`hpreq_max` (vida total o media
// en el servidor), `m_nRndMobs` (la lista de monstruos al azar), `dmgmulti` y
// `hpmulti`, `resetwhen` 1 y 2, `killtarget` y el limitador
// `SpawnLimitReached`. **Ninguna de las 38 plantillas de Gate City usa ninguno**,
// así que portarlos sería escribir sin nada con que comprobarlo. El que sí está
// es `fireallperish`, porque `spawn_bowguys` lo usa para abrir `skele_treasure`.
//
// ── CORRECCIÓN DEL 68: `perishtarget` y `spawnstart` SÍ se portan ─────────
//
// El párrafo de arriba los daba por no portados por la razón correcta —Gate City
// no los usa— y con la conclusión equivocada: **Edana los usa, y son la mitad de
// su corral de jabalíes**. Tres oleadas encadenadas, quince jabalíes normales y
// luego el grande de 60. Sexta vez seguida —50, 60, 61, 63, 67, 68— que el hueco
// lo enseña el segundo mapa, y la primera en que estaba ESCRITO en el archivo que
// el hueco existía. *Una lista de «esto no se porta» envejece con el primer mapa
// nuevo, y nadie la vuelve a leer.*
//
// Con ellos entra también `MSQuery`, que es cómo se despierta UNA ficha por su
// nombre en vez de reiniciar el área entera.
//
// Sin DOM, sin Three y sin Rapier: el reloj de los bichos tiene que ser el mismo
// en el navegador y en el servidor o los dos ven dos pueblos.

/** `pev->nextthink = pev->ltime + 3.0` (msmapents.cpp:744). */
export const PRIMER_PENSAMIENTO = 3.0;

/** `flNextSpawnTime = gpGlobals->time + 0.2` (msmapents.cpp:1213). */
export const ENTRE_APARICIONES = 0.2;

/** `lives == -1` es infinito, y es lo que sale de un `lives` ausente. */
export const INFINITAS = -1;

/**
 * UNA FICHA registrada en un área: `monster_data_t`.
 *
 * `id` es el identificador del bicho en la manada, que **no cambia nunca**: el
 * protocolo manda los bichos por índice, así que aparecer y desaparecer no puede
 * crear ni destruir instancias. Lo que cambia es si está en el mundo.
 */
class Ficha {
  constructor({
    id, vidas = INFINITAS, esperaMin = 0, esperaMax = 0, probabilidad = 100,
    nombre = null, porDisparo = false, alPerecer = null,
  }) {
    this.id = id;
    this.vidas = vidas;
    this.vidasQuedan = vidas;
    this.esperaMin = esperaMin;
    this.esperaMax = esperaMax;
    this.probabilidad = probabilidad;
    /** Su `targetname`: por ahí la despierta `MSQuery` (msmapents.cpp:1302-1315). */
    this.nombre = nombre;
    /**
     * `spawnontrigger`, de `spawnstart`. Con esto puesto **no sale la primera vez
     * hasta que la llamen** (:1210-1213). Las siguientes sí, por su cuenta.
     */
    this.porDisparo = porDisparo;
    /** `triggered`. Una vez despierta, ya no vuelve a dormirse. */
    this.despertada = false;
    /** `perishtarget`: qué dispara al gastar la ÚLTIMA vida (:989-990). */
    this.alPerecer = alPerecer;
    /** Para no disparar el `perishtarget` dos veces. */
    this.perecio = false;
    /** `spawned`: está en el mundo ahora mismo. */
    this.puesto = false;
    /** `deathtime` y `delayvalue`. La primera vez la espera es CERO. */
    this.murioEn = 0;
    this.espera = 0;
    /** Cuántas veces ha aparecido, para poder medirlo. */
    this.apariciones = 0;
  }

  /** `if (lives > 0 && livesleft <= 0)`: sin vidas, no vuelve. */
  get agotada() { return this.vidas > 0 && this.vidasQuedan <= 0; }
}

/**
 * UN ÁREA. Lleva su reloj y sus fichas.
 */
class Area {
  constructor({ nombre, deGolpe = true, porDisparo = false, sorteaSitio = false, alAcabarse = null }) {
    this.nombre = nombre;
    this.deGolpe = deGolpe;
    this.sorteaSitio = sorteaSitio;
    this.alAcabarse = alAcabarse;
    /** `m_fActive`. Con `spawntrigger` nace apagada y hay que dispararla. */
    this.activa = !porDisparo;
    this.porDisparo = porDisparo;
    this.fichas = [];
    /** `pev->nextthink`. `null` cuando no piensa. */
    this.proximoPensar = this.activa ? PRIMER_PENSAMIENTO : null;
    /** `flNextSpawnTime`. */
    this.proximaAparicion = 0;
    /** Si ya se disparó el `fireallperish`, para no dispararlo dos veces. */
    this.acabada = false;
  }
}

/**
 * EL APARECEDOR: las 16 áreas de un mapa, con su reloj.
 *
 * `areas` y `plantillas` son lo que hornea `tools/bichos.mjs`. `plantillas` es
 * una lista de `{ id, area, vidas, esperaMin, esperaMax, probabilidad }`.
 *
 * El dado se inyecta, igual que en la `Fauna`: con `Math.random` en cada
 * navegador dos jugadores verían aparecer monstruos distintos, que es el mismo
 * fallo del 28 con otra ropa.
 */
export class Aparecedor {
  constructor({ areas = [], plantillas = [], azar = Math.random } = {}) {
    this.azar = azar;
    this.t = 0;
    this.areas = new Map();
    for (const a of areas) this.areas.set(a.nombre, new Area(a));
    /** Ficha por id de bicho, para poder avisar de una muerte en O(1). */
    this.porId = new Map();
    /** Las plantillas que apuntan a un área que no está: el motor sólo avisa. */
    this.huerfanas = [];
    for (const p of plantillas) {
      const area = this.areas.get(p.area);
      if (!area) { this.huerfanas.push(p); continue; }
      const f = new Ficha(p);
      area.fichas.push(f);
      this.porId.set(p.id, { ficha: f, area });
    }
    /** Lo que el mundo tiene que hacer: se vacía en cada `tic`. */
    this.sucesos = [];
    /** Lo que se generó ENTRE dos tics (una muerte) y sale en el siguiente. */
    this._porSalir = [];
  }

  /** Cuántas fichas lleva, y cuántas están puestas ahora mismo. */
  get n() { return this.porId.size; }
  get puestas() { return [...this.porId.values()].filter((v) => v.ficha.puesto).length; }

  /** `RANDOM_FLOAT(a, b)`. */
  _entre(a, b) { return a + this.azar() * (b - a); }

  /**
   * ¿Está este bicho en el mundo?
   *
   * Un bicho que NO es plantilla está siempre: los 31 aldeanos y tenderos de Gate
   * City no los pone ningún área y por eso están desde el primer fotograma.
   */
  estaPuesto(id) {
    const v = this.porId.get(id);
    return v ? v.ficha.puesto : true;
  }

  /** Si este bicho lo maneja un área. */
  esPlantilla(id) { return this.porId.has(id); }

  /**
   * UN PASO DEL RELOJ. Devuelve los sucesos: `{ que: "aparece", id }` y
   * `{ que: "seAcaban", area, dispara }`.
   *
   * `dt` en segundos.
   */
  tic(dt) {
    this.t += dt;
    this.sucesos = this._porSalir.splice(0);
    for (const area of this.areas.values()) {
      if (!area.activa || area.proximoPensar === null) continue;
      if (this.t < area.proximoPensar) continue;
      this._pensar(area);
      // `CAreaMonsterSpawn::SpawnMonsters` se reencola solo; el motor lo hace con
      // `nextthink` y aquí basta con volver a mirar en el próximo paso, que es lo
      // mismo con menos ceremonia.
      area.proximoPensar = this.t;
    }
    return this.sucesos;
  }

  /** `SpawnMonsters`, recortado a lo que Gate City usa. */
  _pensar(area) {
    let agotadas = 0;
    for (const f of area.fichas) {
      if (f.puesto) continue;
      if (f.agotada) { agotadas++; continue; }
      // `if (spawnontrigger && !triggered && lives == livesleft) continue;`
      // (msmapents.cpp:1208-1213). La tercera mitad es la que importa: sólo frena
      // la PRIMERA aparición, así que un `boarboss` que ya salió una vez vuelve
      // solo. Y ojo, **no cuenta como agotada**: el área sigue pensando y su
      // `fireallperish` sigue esperando, que es lo que el motor hace.
      if (f.porDisparo && !f.despertada && f.vidas === f.vidasQuedan) continue;
      // `if ((gpGlobals->time - deathtime) < delayvalue) continue;`
      if (this.t - f.murioEn < f.espera) continue;
      // `if (RANDOM_FLOAT(0, 99) > spawnchance)`: falla, se vuelve a sortear la
      // espera y se sigue. Con 100 nunca falla, que es el caso de Gate City.
      if (this._entre(0, 99) > f.probabilidad) { this._rearmar(f); continue; }
      // El escalonado: como mucho uno cada 0,2 s. `spawnstart 1` es justamente
      // quien lo respeta —«otherwise it fubars the already buggy fireallperish»—,
      // así que un área sin `spawnstart` los suelta todos de golpe.
      if (this.t < area.proximaAparicion && area.deGolpe) continue;
      area.proximaAparicion = this.t + ENTRE_APARICIONES;

      f.puesto = true;
      f.apariciones++;
      // `if (lives > 0 && livesleft > 0) livesleft--`: se gasta al APARECER, no
      // al morir. Con vidas 1, el bicho sale una vez y al morir ya no vuelve.
      if (f.vidas > 0 && f.vidasQuedan > 0) f.vidasQuedan--;
      this.sucesos.push({ que: "aparece", id: f.id, area: area.nombre });
    }
    // `fireallperish`: cuando TODAS se han quedado sin vidas. En Gate City lo usa
    // `spawn_bowguys` para abrir `skele_treasure`, o sea que el cofre del tesoro
    // sale cuando has matado a los tres ballesteros.
    if (!area.acabada && area.fichas.length && agotadas === area.fichas.length) {
      area.acabada = true;
      if (area.alAcabarse) {
        this.sucesos.push({ que: "seAcaban", area: area.nombre, dispara: area.alAcabarse });
      }
    }
  }

  /**
   * `RespawnMonster` (msmapents.cpp:983-990): sortea la espera si le quedan
   * vidas, y si NO le quedan dispara su `perishtarget`.
   *
   *   if (lives == -1 || livesleft > 0)   { deathtime = ...; delayvalue = ...; }
   *   else if (lives > 0 && !livesleft)   FireTargets(perishtarget, ...);
   *
   * Es un `else if`, o sea que las dos ramas **se excluyen**: el que perece no
   * rearma, y el que rearma no dispara. El `perecio` de aquí es nuestro y no del
   * motor: allí no hace falta porque una ficha agotada ya no vuelve a pasar por
   * `DeathNotice`, y aquí `_rearmar` lo llama también `_pensar` al fallar el
   * sorteo de probabilidad — con `spawnchance 100` nunca ocurre, pero el freno se
   * pone igual antes de que alguien baje esa cifra y el pueblo dispare dos veces.
   */
  _rearmar(f) {
    if (f.puesto) return;
    if (f.vidas === INFINITAS || f.vidasQuedan > 0) {
      f.murioEn = this.t;
      f.espera = this._entre(f.esperaMin, f.esperaMax);
      return;
    }
    if (f.vidas > 0 && f.vidasQuedan <= 0 && f.alPerecer && !f.perecio) {
      f.perecio = true;
      // A LA COLA, y no a `sucesos`: a `_rearmar` la llama `muerto()`, que la
      // llama quien lleva la vida de los bichos y NO está dentro de un `tic`. Un
      // `push` directo caería en el array del tic anterior —ya devuelto y puede
      // que ya consumido— y el siguiente `tic` lo borraría. Este es el fallo de
      // «entre dos piezas que funcionan» del 63, visto antes de escribirlo.
      this._porSalir.push({ que: "perece", id: f.id, nombre: f.nombre, dispara: f.alPerecer });
    }
  }

  /**
   * SE HA MUERTO UNO. Lo llama quien lleve la vida de los bichos.
   *
   * Devuelve `true` si volverá y `false` si se ha quedado sin vidas. Ojo con lo
   * que NO hace: no espera a que el cadáver se desvanezca. En el motor el
   * monstruo se borra y el área cuenta desde `deathtime`, que es el instante de
   * la muerte y no el del cadáver.
   */
  muerto(id) {
    const v = this.porId.get(id);
    if (!v) return false;
    v.ficha.puesto = false;
    this._rearmar(v.ficha);
    return !v.ficha.agotada;
  }

  /**
   * `ResetUse`: algo ha disparado un área — la bolsa rompible de las crías apunta
   * a la suya con `target`.
   *
   * Se porta el caso de Gate City: `resetwhen` ausente, o sea **0**, que es «sólo
   * se reinicia cuando están todas muertas» (`if (m_fActive && !resetwhen)
   * return;`, msmapents.cpp:754-758). Y encender un área apagada por
   * `spawntrigger`, que es el otro uso.
   */
  disparar(nombre) {
    // PRIMERO las fichas (el 68). Un nombre puede ser el de un área o el de una
    // ficha, y son dos entidades distintas del `.bsp`: `msarea_monsterspawn
    // boars1` lleva el reloj, y `msmonster_boar boarboss` es una ficha suya con
    // su propio `targetname`. En el motor son dos `Use` diferentes —el del área
    // y el `MSQuery` de la plantilla— y aquí entran por la misma puerta, así que
    // el orden lo decide esto. Se miran las fichas antes porque el área de Edana
    // NO se llama como ninguna de ellas y así un `usetrigger boarboss` no acaba
    // reiniciando un área por accidente.
    if (this._despertarFicha(nombre)) return true;
    const area = this.areas.get(nombre);
    if (!area) return false;
    if (!area.activa) {
      area.activa = true;
      area.proximoPensar = this.t + PRIMER_PENSAMIENTO;
      return true;
    }
    // `resetwhen` 0 y el área activa: no hace nada. Es lo que dice el motor, y
    // por eso romper la bolsa de una cría que sigue viva no saca otra.
    return false;
  }

  /**
   * `MSQuery` (msmapents.cpp:1301-1316): despierta UNA ficha, la que se llama así.
   *
   *   mdSpawnMonster[i].triggered = true;
   *   mdSpawnMonster[i].deathtime = mdSpawnMonster[i].delayvalue = 0;
   *
   * Las dos cosas, y la segunda importa tanto como la primera: al poner la espera
   * a cero el bicho sale en el siguiente pensamiento y no dentro de los 5 a 25
   * segundos que dice su `delaylow`/`delayhigh`. Por eso el jefe de Edana entra
   * de golpe cuando le toca.
   *
   * En el motor no se le llama por nombre sino por la entidad de plantilla
   * (`lTrigPrivData`), a la que el motor llega por su `targetname`; aquí el
   * nombre es lo único que cruza el cable, así que se busca por él.
   *
   * Devuelve `true` si había alguna, para que `disparar` sepa que ya está servido.
   */
  _despertarFicha(nombre) {
    let alguna = false;
    for (const { ficha } of this.porId.values()) {
      if (ficha.nombre !== nombre) continue;
      alguna = true;
      ficha.despertada = true;
      ficha.murioEn = 0;
      ficha.espera = 0;
    }
    return alguna;
  }

  /**
   * `UTIL_Remove` sobre el área, que es lo que hace `deleteent <area> remove`.
   *
   * Es el final de la segunda misión del alcalde: al matar los 40 zombis,
   * `remove_spawns_loop` quita `spawners6` a `spawners10` uno por segundo y las
   * catacumbas dejan de reponer muertos vivientes.
   *
   * Lo que NO hace, porque el motor tampoco: **los que ya están puestos se
   * quedan**. Quitar el generador no mata a nadie, sólo deja de reponer. Y por
   * eso las fichas siguen en `porId` — si se borraran, `estaPuesto` diría que
   * sí para todas (el valor por omisión es «no es plantilla, está siempre») y
   * el mundo volvería a poner los zombis que acabamos de dejar de generar.
   */
  borrar(nombre) {
    const area = this.areas.get(nombre);
    if (!area) return false;
    area.activa = false;
    area.proximoPensar = null;
    area.borrada = true;
    this.areas.delete(nombre);
    return true;
  }

  /** Para la sonda y para las pruebas: el estado de una ficha. */
  fichaDe(id) {
    const v = this.porId.get(id);
    if (!v) return null;
    const f = v.ficha;
    return {
      area: v.area.nombre, puesto: f.puesto, vidas: f.vidas, vidasQuedan: f.vidasQuedan,
      espera: Math.round(f.espera * 100) / 100, murioEn: Math.round(f.murioEn * 100) / 100,
      apariciones: f.apariciones, agotada: f.agotada,
      nombre: f.nombre, porDisparo: f.porDisparo, despertada: f.despertada,
      alPerecer: f.alPerecer, perecio: f.perecio,
    };
  }
}

/** Saca de un censo las plantillas y las áreas, en la forma que quiere el Aparecedor. */
export function delCenso(censo) {
  const plantillas = [];
  for (const [id, c] of (censo?.colocados ?? []).entries()) {
    if (!c.aparecedor) continue;
    plantillas.push({ id, ...c.aparecedor });
  }
  return { areas: censo?.areas ?? [], plantillas };
}
