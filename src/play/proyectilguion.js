// EL DAÑO QUE HACE EL GUION DE UN PROYECTIL, y no el motor — el 97.
//
// `src/play/proyectil.js` porta `ProjectileTouch`: el daño de una flecha es su
// `reg.proj.dmg` por la potencia de arquería. Eso vale para las flechas de arco.
// Hay otros DOS caminos en Master Sword, y los dos están en el guion del
// proyectil y no en el motor:
//
//   1. LOS PROYECTILES DE RELLENO. Doce declaran `PROJ_DAMAGE 0` o `1` «via
//      tossprojectile only» y pegan con un `xdodamage` en su propio guion. Las
//      lanzas de asta lo hacen al dar a alguien (`game_projectile_hitnpc`), la
//      flecha del Fénix al chocar (`game_projectile_hitwall`, porque atraviesa a
//      los NPC), y dos esferas mientras vuelan. El motor también hace lo suyo
//      —`Damage * potencia/100` en `ProjectileTouch` (giprojectile.cpp:156-168)—
//      y con 0 o 1 de base eso es nada o casi nada: los dos daños se SUMAN.
//
//   2. LAS SAETAS DE BALLESTA (`HITSCAN_BOLT 1`). `proj_base` les pone el daño
//      del motor a CERO (proj_base.script:55-56) y en `game_tossprojectile` —que
//      corre DENTRO de `TossProjectile`, antes de su primer `Think`
//      (giprojectile.cpp:114-116)— tira un rayo de 8 000 unidades y pega en el
//      acto (`hitscan_bolt`, proj_base.script:180-249). La saeta sigue volando
//      después, de adorno.
//
// Igual que `proyectil.js`, esto no conoce Three ni Rapier: es la regla, y la
// prueba la llama sin navegador. Quien tiene el mundo (`src/juego/arco.js`)
// pone las distancias, la relación y la habilidad.
//
// ── UNA COSA DEL LENGUAJE QUE DECIDE TRES NÚMEROS ─────────────────────────
//
// Las lanzas leen la carga con `$get(ent_expowner,scriptvar,'PLR_SPEAR_CHARGE_LEVEL')`.
// Esa variable la pone UN sitio, `ext_toss_spear` (player/externals.script:1935-1939),
// que llama el lanzamiento POR GUION de las armas con `POLE_CAN_THROW`
// (polearms_base.script:1057). El lanzamiento del MOTOR —el ataque registrado
// con `POLE_CAN_POWER_THROW`, que es el que tienen el tridente y el Ice Typhoon—
// no la toca. Sin poner, `GetVar` devuelve el NOMBRE de la variable
// (`GetFirstScriptVar`, script.cpp:5949-5955), `multiply` le hace `atof`
// (scriptcmds.cpp:4210-4213) y eso es 0: el factor de carga sale 0·k + 1 = 1.
// Aquí `cargaLanza = null` es eso, y es lo que pasa en este puerto, que no tiene
// el lanzamiento por guion.

/** `$get(<x>,skill.<s>)` es el valor de la HABILIDAD (`GetSkillStat(Stat)`,
 *  scriptcmds.cpp:1651-1676), y las cuentas lo multiplican por 0,01. */
export const POR_CIENTO = 0.01;

/** El largo del rayo de la saeta: `$relpos(...,$vec(0,8000,0))` (proj_base.script:202). */
export const RAYO_DE_SAETA = 8000;

/**
 * LOS DOCE, uno por uno, con lo que se porta y lo que no.
 *
 * `cuando`:
 *   - `"alPegar"`        `game_projectile_hitnpc` → `xdodamage <bicho> direct`.
 *   - `"alChocar"`       `game_projectile_hitwall` → `xdodamage <punto> <radio>`
 *                        (área). Con `PROJ_IGNORENPC 1` también salta al tocar
 *                        un bicho: `ProjectileTouch` no hace `DoDamage` y cae en
 *                        la rama de «pared» (giprojectile.cpp:136-152, :214-220).
 *   - `"enVuelo"`        un `xdodamage` de área que se repite mientras vuela.
 *   - `"alAterrizar"`    `game_projectile_landed` → un externo del jugador.
 *
 * `portado` dice si este puerto corre ese daño. Lo que el guion hace ADEMÁS del
 * daño (empujes, venenos, congelar, invocar) va en `sinPortar`, con su cita: no
 * es un hueco callado, es una lista.
 */
export const PROYECTILES_DE_GUION = Object.freeze({
  proj_pole_spear: {
    cuando: "alPegar", portado: true, base: 75, habilidad: "polearms", tipo: "pierce",
    carga: 2.0, cerca: 256, soloContraEnemigos: false, siVive: false,
    cita: "proj_pole_spear.script:40-67",
    sinPortar: [],
  },
  proj_pole_harpoon: {
    cuando: "alPegar", portado: true, base: 175, habilidad: "polearms", tipo: "pierce",
    carga: 3.0, cerca: 256, soloContraEnemigos: false, siVive: false,
    cita: "proj_pole_harpoon.script:42-81",
    sinPortar: ["el empujón `setvelocity` de 800 × carga hacia fuera (:83-87)"],
  },
  proj_pole_trident: {
    cuando: "alPegar", portado: true, base: 175, habilidad: "polearms", tipo: "pierce",
    carga: 1.5, cerca: null, soloContraEnemigos: false, siVive: false,
    cita: "proj_pole_trident.script:43-61",
    sinPortar: [],
  },
  proj_pole_ti: {
    // El tipo del daño NO es su `PROJ_DAMAGE_TYPE pierce` (:13): el `xdodamage`
    // escribe `cold` a mano (:64), y es ése el que llega al bicho.
    cuando: "alPegar", portado: true, base: 300, habilidad: "polearms", tipo: "cold",
    carga: 1.5, cerca: null, soloContraEnemigos: false, siVive: false,
    cita: "proj_pole_ti.script:46-64",
    sinPortar: ["`dot_cold` o `dot_cold_freeze` con hielo ≥ 25 (:66-89)"],
  },
  proj_pole_dra: {
    cuando: "alPegar", portado: true, base: 300, habilidad: "polearms", tipo: "fire",
    carga: null, cerca: null, soloContraEnemigos: false, siVive: false,
    cita: "proj_pole_dra.script:39-54",
    sinPortar: [
      "`dot_fire` con fuego ≥ 15 (:56-60; y `multiply LOT_DOT 0.5` es una errata: L_DOT no se divide)",
      "la ráfaga de fuego `do_fire_burst` con fuego ≥ 20 (:58, :63-107)",
    ],
  },
  proj_pole_holy: {
    // `if $get(PARAM1,isalive)` va DESPUÉS de `turn_undead`, que puede haberlo
    // matado ya: en ese caso no hay segundo daño (:69-72).
    cuando: "alPegar", portado: true, base: 800, habilidad: "polearms", tipo: "holy",
    carga: null, cerca: null, soloContraEnemigos: true, siVive: true,
    cita: "proj_pole_holy.script:43-72",
    sinPortar: ["el empujón de 800 (:59-65)", "`turn_undead` con adivinación × 5 (:67-69)"],
  },
  proj_pole_ph: {
    cuando: "alPegar", portado: true, base: 800, habilidad: "polearms", tipo: "lightning",
    carga: null, cerca: null, soloContraEnemigos: true, siVive: false,
    cita: "proj_pole_ph.script:43-59",
    sinPortar: ["la jaula `debuff_hold` con maná ≥ 100, o el empujón y `dot_lightning` (:61-94)"],
  },
  proj_pole_a: {
    cuando: "alPegar", portado: true, base: 800, habilidad: "polearms", tipo: "acid",
    carga: null, cerca: null, soloContraEnemigos: true, siVive: true,
    cita: "proj_pole_a.script:49-80",
    sinPortar: ["el empujón de 800 y `dot_acid` (:67-77)", "la nube `affliction_lance` al clavarse en el suelo (:83-135)"],
  },
  proj_pole_sl: {
    // EL 98. No tiene `game_projectile_hitnpc`: su daño es la ráfaga oscura del
    // JUGADOR al aterrizar (`callexternal ent_expowner ext_dburst L_MY_ORG 96 0 0`,
    // :60) — `ext_dburst`, player/externals.script:3413-3434. Ver `rafagaOscura`.
    // `game_projectile_landed` lo llama `ProjectileTouch` SIEMPRE, toque bicho
    // o pared (giprojectile.cpp:189), y antes que `hitnpc`/`hitwall`.
    cuando: "alAterrizar", portado: true, base: null, habilidad: "spellcasting.affliction", tipo: "dark_effect",
    area: { radio: 96, caida: 0.1, factor: 3 },
    cita: "proj_pole_sl.script:48-61 → player/externals.script:3413-3434",
    sinPortar: [
      "`dburst_dodamage`: `dot_dark` de 15 s con aflicción × 0,5 a cada enemigo tocado (player/externals.script:3437-3446)",
      "los efectos de cliente (`sfx_dburst`, `proj_pole_sl_cl`) y la luz que le sigue en vuelo (:43-44, :59-61)",
    ],
  },
  proj_arrow_spiral: {
    // EL 98. El daño lo pone el ARCO por un externo del jugador (`ext_set_spiral
    // <tipo> <daño>`, player/externals.script:1517-1550; ver `espiralDelArco`),
    // y se repite cada 0,1 s en 128 u mientras vuela (:93-101).
    cuando: "enVuelo", portado: true, base: null, habilidad: "archery", tipo: null,
    vuelo: { primero: 0.01, periodo: 0.1, radio: 128, caida: 0, vida: 10.0 },
    cita: "proj_arrow_spiral.script:65-101",
    sinPortar: [
      "el arco élfico lo prepara en `game_deploy` y aquí se calcula al soltar: si la habilidad cambia con el arco en la mano, el motor sigue con la de antes",
      "el `cancelattack` de `ranged_start` es al EMPEZAR a tensar; aquí se mira al soltar",
    ],
  },
  proj_ub: {
    // EL 98. Del JUGADOR: aflicción × 8 (:76-77), área de `SCAN_RANGE` 32 u
    // (:27) con caída 0,1, cada 0,2 s mientras vuela (:84-92). El inflictor es
    // el ARMA (`WEAPON_ID`, :78) y no el jugador.
    cuando: "enVuelo", portado: true, base: null, habilidad: "swordsmanship", tipo: "dark",
    vuelo: { primero: 0.01, periodo: 0.2, radio: 32, caida: 0.1, vida: 10.0 },
    cita: "proj_ub.script:63-92",
    sinPortar: [
      "herir al propio tirador: con el ARMA de inflictor (`WEAPON_ID`, :78) el área no se salta al jugador (`pTarget == Damage.pInflictor`, giattack.cpp:1553) y `xdodamage` de área es `DMG_REFLECTIVE` (scriptcmds.cpp:7405), así que si la sombra pasa a menos de 32 u del jugador le pega",
      "la espada que se vuelve invisible mientras vuela y vuelve al aterrizar (`ext_register_projectile`/`ext_projectile_landed`, swords_ub.script:167-178)",
    ],
  },
  proj_arrow_phx: {
    cuando: "alChocar", portado: true, base: null, habilidad: "archery", tipo: "fire",
    cita: "proj_arrow_phx.script:60-106",
    // El 97 apuntaba aquí también «herir al propio tirador: el área es
    // `DMG_REFLECTIVE` y no se salta al dueño (giattack.cpp:1558-1559)».
    // CORRECCIÓN DEL 98: tres líneas antes, `pTarget == Damage.pInflictor` se
    // salta al INFLICTOR (giattack.cpp:1553), y la flecha pasa `ent_expowner
    // ent_expowner` —el jugador es atacante E inflictor (proj_arrow_phx.script:104)—.
    // El Fénix no quema a quien lo tira. La que sí puede es la sombra del
    // Unholy Blade, que pone el ARMA de inflictor (ver `proj_ub`).
    sinPortar: [
      "el `dot_fire` de fuego × 0,5 a los enemigos del radio (:108-133)",
    ],
  },
});

/**
 * EL DAÑO DE UNA LANZA DE ASTA AL DAR A ALGUIEN.
 *
 *     local L_DMG <base>
 *     local OWNER_SKILL_RATIO $get(ent_expowner,skill.polearms)
 *     multiply OWNER_SKILL_RATIO 0.01
 *     multiply L_DMG OWNER_SKILL_RATIO
 *     local CHARGE_LEVEL $get(ent_expowner,scriptvar,'PLR_SPEAR_CHARGE_LEVEL')
 *     multiply CHARGE_LEVEL <k>     add CHARGE_LEVEL 1.0     multiply L_DMG CHARGE_LEVEL
 *     if ( TARG_DIST < 256 ) multiply L_DMG (TARG_DIST / 256)
 *     xdodamage PARAM1 direct L_DMG 100% ent_expowner ent_me polearms <tipo>
 *                                    proj_pole_spear.script:42-67 (las demás, igual)
 *
 * Sin dado, sin crítico y al 100 %: `xdodamage ... direct` no tira nada
 * (scriptcmds.cpp:7413-7419). Lo único que lo cambia después es el
 * `m_DMGMulti` del atacante (:7365), que es `multiplicadorDelAtacante`.
 *
 * @param {object} o
 * @param {number} o.habilidad   `skill.polearms` del tirador (el VALOR de la habilidad)
 * @param {number|null} o.cargaLanza  `PLR_SPEAR_CHARGE_LEVEL`; `null` = sin poner (ver arriba)
 * @param {number} o.distancia   de origen a origen, en unidades
 * @param {string} o.relacion    la del BICHO hacia el tirador, en texto (`enemy`…)
 * @param {boolean} o.esJugador  si el blanco es un jugador
 * @param {boolean} o.pvp        `game.pvp`
 * @returns {{ dano: number, tipo: string, cubo: string } | { dano: 0, porQue: string }}
 */
export function danoDeLanza(id, {
  habilidad = 0, cargaLanza = null, distancia = Infinity, relacion = "enemy",
  esJugador = false, pvp = false, vivo = true, multiplicadorDelAtacante = 0,
} = {}) {
  const r = PROYECTILES_DE_GUION[id];
  if (!r || r.cuando !== "alPegar") return { dano: 0, porQue: "no es una lanza que pegue al dar" };
  // `if ( $get(PARAM1,isplayer) ) { if !game.pvp ... EXIT_SUB }` — en las que
  // lo traen; la del bastón (`spear`) y el tridente NO lo traen.
  if (esJugador && !pvp && ["proj_pole_harpoon", "proj_pole_dra", "proj_pole_holy",
    "proj_pole_ph", "proj_pole_a"].includes(id)) return { dano: 0, porQue: "un jugador sin pvp" };
  // `if $get(PARAM1,relationship,ent_expowner) equals enemy` — un `if` viejo:
  // con la condición falsa abandona el evento entero (script.cpp:5754-5758).
  if (r.soloContraEnemigos && relacion !== "enemy") return { dano: 0, porQue: `relación «${relacion}», no «enemy»` };
  if (r.siVive && !vivo) return { dano: 0, porQue: "ya no vive" };
  let d = r.base * (habilidad * POR_CIENTO);
  if (r.carga !== null) {
    const nivel = cargaLanza === null || cargaLanza === undefined ? 0 : Number(cargaLanza) || 0;
    d *= nivel * r.carga + 1.0;
  }
  if (r.cerca !== null && distancia < r.cerca) d *= distancia / r.cerca;
  if (multiplicadorDelAtacante > 0) d *= multiplicadorDelAtacante;
  return { dano: d, tipo: r.tipo, cubo: r.habilidad };
}

/**
 * LA EXPLOSIÓN DEL FÉNIX, al chocar.
 *
 *     local DISTANCE_TRAVELED $dist(USER_ORG,MY_ORG)    (MY_ORG con la z del suelo)
 *     local OWNER_SKILL $get(ent_expowner,skill.archery.power)
 *     MIN_DMG = OWNER_SKILL, MAX_DMG = OWNER_SKILL × 3
 *     if ( DISTANCE_TRAVELED >= MAX_DIST ) { MAX_DMG, MAX_RADIUS }
 *     else { $get_skill_ratio(DISTANCE_RATIO,MIN,MAX) de los dos }
 *     if ( isplayer ) { if skill.archery < 25 ... × 0,1 y radio × 0,5 }
 *     xdodamage MY_ORG MY_RADIUS MY_DAMAGE 0 ent_expowner ent_expowner archery fire
 *                                             proj_arrow_phx.script:60-101
 *
 * Con `MAX_DIST 1024`, `MIN_RADIUS 32`, `MAX_RADIUS 256` (:18-20) y
 * `$get_skill_ratio(r,a,b) = a + (b - a) · r` (script.cpp:2527-2545). El `if
 * skill.archery < 25` es un `if` VIEJO dentro del bloque: con 25 o más abandona
 * el bloque y no hay recorte.
 *
 * Y el área es el `DoDamage` de siempre con caída 0: `pow(ratio, 0) = 1`, o sea
 * el daño ENTERO a todo lo que tenga el centro a menos del radio y la línea
 * libre de mundo (giattack.cpp:1561-1592). Ver `danoEnArea`.
 */
export function explosionDelFenix({ distancia = 0, potencia = 0, arqueria = 0, esJugador = true } = {}) {
  const MAX_DIST = 1024, MIN_RADIO = 32, MAX_RADIO = 256;
  const min = potencia, max = potencia * 3.0;
  let dano, radio;
  if (distancia >= MAX_DIST) { dano = max; radio = MAX_RADIO; } else {
    const r = distancia / MAX_DIST;
    dano = min + (max - min) * r;
    radio = MIN_RADIO + (MAX_RADIO - MIN_RADIO) * r;
  }
  const torpe = esJugador && arqueria < 25;
  if (torpe) { dano *= 0.1; radio *= 0.5; }
  return { dano, radio, tipo: "fire", cubo: "archery", torpe };
}

/**
 * EL REPARTO DE UN ÁREA del motor: `Base · (1 − d/R)^caída`, y nada si d ≥ R
 * (giattack.cpp:1585-1592). Con caída 0 es el daño entero.
 */
export function danoEnArea(dano, distancia, radio, caida = 0) {
  if (!(radio > 0)) return 0;
  const ratio = 1 - distancia / radio;
  if (ratio <= 0) return 0;
  return dano * Math.pow(ratio, caida);
}

/**
 * EL MULTIPLICADOR DE UNA SAETA, que lo pone LA BALLESTA y lo lee la saeta:
 *
 *     local DMG_MULTI $get(MY_XBOW,scriptvar,'HITSCAN_DMG_MULTI')
 *     if ( DMG_MULTI > 0 ) multiply MY_DAMAGE DMG_MULTI        proj_base.script:220-221
 *
 * El `reg.attack.dmg.multi` del ataque no vale para estas: «this has no affect
 * on hitscan arrows» (bows_sxbow.script:75), porque `TossProjectile` lo aplica
 * a un `reg.proj.dmg` que es cero.
 *
 *   - `bows_crossbow_light` no escribe `HITSCAN_DMG_MULTI`: `GetVar` devuelve
 *     el nombre, el `> 0` es falso y queda ×1.
 *   - `bows_crossbow_heavy33`: `RANGED_DMG_MULTI 2.0` con arquería ≥ 20, y 0,1
 *     por debajo (`check_newb`, bows_crossbow_heavy33.script:158-194).
 *   - `bows_sxbow`: 1,5 con arquería ≥ 35, y 0,1 por debajo (`check_skill`,
 *     bows_sxbow.script:302-338). OJO: la de vapor dispara por su propio
 *     `game_attack1_down` y no por el ataque del motor (`ranged_start` hace
 *     `cancelattack`, :83-85): eso no está portado.
 */
export function multiplicadorDeSaeta(ballesta, arqueria = 0) {
  switch (ballesta) {
    case "bows_crossbow_heavy33": return arqueria < 20 ? 0.1 : 2.0;
    case "bows_sxbow": return arqueria < 35 ? 0.1 : 1.5;
    default: return 1;
  }
}

/**
 * ¿VUELA O ES INSTANTÁNEA? `HITSCAN_BOLT`, salvo la de acero (`HEAVY_ONLY`),
 * que sólo lo es en una ballesta cuyo NOMBRE contenga «Heavy» o «Steam»
 * (`$get(MY_XBOW,name) contains Heavy`, proj_base.script:182-198).
 */
export function esInstantanea(flecha, nombreDeLaBallesta = "") {
  if (!flecha?.instantanea) return false;
  if (!flecha.soloPesada) return true;
  const n = String(nombreDeLaBallesta ?? "");
  return n.includes("Heavy") || n.includes("Steam");
}

/**
 * EL DAÑO DE UNA SAETA QUE ACIERTA:
 *
 *     local MY_DAMAGE $get(ent_expowner,skill.archery)
 *     multiply MY_DAMAGE 0.01
 *     multiply MY_DAMAGE PROJ_DAMAGE
 *     if ( DMG_MULTI > 0 ) multiply MY_DAMAGE DMG_MULTI
 *     xdodamage PARAM1 direct MY_DAMAGE 100% ent_expowner ent_expowner archery PROJ_DAMAGE_TYPE
 *                                             proj_base.script:258-264
 *
 * Fijo: `PROJ_DAMAGE` es un número en las saetas (100 la gratis), y aquí no
 * hay `potencia / 100` sino el VALOR de la habilidad entera. La flecha de arco
 * es otra cosa (`danoDeFlecha`).
 */
export function danoDeSaeta({ arqueria = 0, base = 0, multiplicador = 1 } = {}) {
  let d = arqueria * POR_CIENTO * base;
  if (multiplicador > 0) d *= multiplicador;
  return d;
}

// ── EL 98: LOS TRES QUE FALTABAN ─────────────────────────────────────────

/**
 * LA RÁFAGA OSCURA de la Shadow Lance, al aterrizar.
 *
 *     local L_MY_GROUND $get_ground_height(L_MY_ORG)
 *     if ( L_MY_GROUND > z - 128 ) { if L_MY_GROUND < z + 128   vectorset L_MY_ORG z L_MY_GROUND }
 *     callexternal ent_expowner ext_dburst L_MY_ORG 96 0 0      proj_pole_sl.script:50-60
 *
 *     PLR_DBURST_DMG = skill.spellcasting.affliction × 3
 *     xdodamage PLR_DBURST_ORG PLR_DBURST_AOE PLR_DBURST_DMG 0.1 ent_me ent_me
 *               spellcasting.affliction dark_effect dmgevent:dburst
 *                                             player/externals.script:3413-3434
 *
 * El área la corre el JUGADOR (`ent_me ent_me`): atacante e inflictor, así que
 * no se pega a sí mismo (giattack.cpp:1553). Caída 0,1: `daño · (1 − d/96)^0,1`.
 *
 * `y` es la altura del proyectil y `suelo` la de `$get_ground_height`, las dos
 * en unidades (aquí el eje de arriba es el segundo). Devuelve el centro.
 */
export function centroDeLaRafaga(punto, suelo) {
  const c = [...punto];
  // Los dos `if`: el de fuera es nuevo y el de dentro VIEJO; los dos sólo
  // deciden si se pega al suelo, así que el resultado es el mismo.
  if (suelo !== null && suelo !== undefined && suelo > c[1] - 128 && suelo < c[1] + 128) c[1] = suelo;
  return c;
}

export function rafagaOscura({ afliccion = 0 } = {}) {
  const r = PROYECTILES_DE_GUION.proj_pole_sl.area;
  return { dano: afliccion * r.factor, radio: r.radio, caida: r.caida, tipo: "dark_effect", cubo: "spellcasting.affliction" };
}

/**
 * LA SOMBRA DEL UNHOLY BLADE, mientras vuela.
 *
 *     setvard DMG_AMT $get(ent_expowner,skill.spellcasting.affliction)
 *     multiply DMG_AMT 8                                       proj_ub.script:76-77
 *     xdodamage $get(ent_me,origin) SCAN_RANGE DMG_AMT 0.1 ent_expowner WEAPON_ID swordsmanship dark
 *                                                              :91
 *
 * Una vez a los 0,01 s de soltarla y luego cada 0,2 s mientras `IS_ACTIVE`
 * (:84, :87-89), que deja de serlo al chocar contra lo que sea (`remove_me`,
 * :55-61, :94-96) o a los 10 s (:65).
 */
export function danoDeSombra({ afliccion = 0 } = {}) {
  const v = PROYECTILES_DE_GUION.proj_ub.vuelo;
  return { dano: afliccion * 8, radio: v.radio, caida: v.caida, tipo: "dark", cubo: "swordsmanship" };
}

/**
 * LOS CUATRO ARCOS DE TORKALATH, que son los que tiran la esfera.
 *
 * El arco calcula el daño y se lo deja al JUGADOR (`callexternal ent_owner
 * ext_set_spiral <tipo> <daño>`, bows_telf1.script:47-53), y la esfera lo lee de
 * ahí al nacer (`$get(ent_expowner,scriptvar,'SPIRAL_DMG')`, proj_arrow_spiral.script:71-72):
 *
 *     local DMG_AMT $get(ent_owner,skill.spellcasting.<escuela>)
 *     multiply DMG_AMT DMG_ADJ
 *     if ( UNDER_SKILLED ) multiply DMG_AMT 0.1
 *
 * `UNDER_SKILLED` lo pone `skill_check` con arquería < `BASE_LEVEL_REQ` 30
 * (base_ranged.script:67, :83; bows_telf1.script:4). El tipo es el de
 * `ext_set_spiral`: `fire_effect`, `cold_effect`, `lightning_effect`
 * (player/externals.script:1525-1550).
 */
export const ARCOS_DE_ESPIRAL = Object.freeze({
  bows_telf1: { escuelas: ["fire"], ajuste: 0.65, cita: "bows_telf1.script:26, :46-53" },
  bows_telf2: { escuelas: ["ice"], ajuste: 0.55, cita: "bows_telf2.script:26, :41-47" },
  bows_telf3: { escuelas: ["lightning"], ajuste: 0.65, cita: "bows_telf3.script:27, :42-48" },
  // El de caos SORTEA la escuela en cada `set_bow_type` (`$rand(1,3)`, :44) y
  // su `ranged_start` lo llama DOS veces (:75-78): vale el segundo sorteo, y
  // cualquiera de los dos puede cancelar.
  bows_telf4: { escuelas: ["fire", "ice", "lightning"], ajuste: 0.75, sorteo: true, cita: "bows_telf4.script:26, :40-78" },
});

const TIPO_DE_ESPIRAL = { fire: "fire_effect", ice: "cold_effect", lightning: "lightning_effect" };
/** El nombre que el arco le da a la escuela (`TORKIE_BOW_TYPE`): el hielo es `cold`. */
const NOMBRE_DE_ESPIRAL = { fire: "fire", ice: "cold", lightning: "lightning" };

/**
 * ¿TIRA, Y CON QUÉ DAÑO? Devuelve `{ dano, tipo, escuela, mensajes, cancela }`.
 *
 * LO QUE CANCELA, y aquí hay un fallo del original que se porta: los tres
 * arcos de después INCLUYEN el primero (`#include items/bows_telf1`,
 * bows_telf2.script:29, telf3:30, telf4:29) y sus `ranged_start` no llevan
 * `[override]`, así que corren LOS DOS — el del de fuego primero:
 *
 *     local OWNER_SKILL $get(ent_owner,skill.spellcasting.fire)
 *     if OWNER_SKILL < 15
 *     dplayermessage ent_owner You lack the fire affinity to activate this bow's magic.
 *     cancelattack                                             bows_telf1.script:79-85
 *
 * O sea que el arco de escarcha pide fuego 15 además de hielo 15, y el de caos
 * pide fuego 15 además de lo suyo. `cancelattack` no corta el evento: los
 * mensajes salen todos.
 *
 * @param {string} arco el id del arco
 * @param {object} o
 * @param {(escuela: string) => number} o.escuela `skill.spellcasting.<escuela>` del tirador
 * @param {number} o.arqueria `skill.archery` (el valor de la habilidad)
 * @param {() => number} o.azar para `$rand(1,3)`
 */
export function espiralDelArco(arco, { escuela = () => 0, arqueria = 0, azar = Math.random } = {}) {
  const a = ARCOS_DE_ESPIRAL[arco];
  // Un arco que no es de Torkalath nunca llama a `ext_set_spiral`: la esfera lee
  // `SPIRAL_DMG` sin poner, que es su nombre, y `xdodamage` le hace `atof` → 0.
  if (!a) return { dano: 0, tipo: null, escuela: null, mensajes: [], cancela: false };
  const mensajes = [];
  // `ranged_start` del de fuego, que corre en los cuatro.
  if (escuela("fire") < 15) mensajes.push("You lack the fire affinity to activate this bow's magic.");
  // El suyo, en los de una escuela distinta.
  if (!a.sorteo && a.escuelas[0] !== "fire" && escuela(a.escuelas[0]) < 15) {
    mensajes.push(`You lack the ${a.escuelas[0]} affinity to activate this bow's magic.`);
  }
  const corto = arqueria < 30;
  const tirada = () => {
    const e = a.sorteo ? a.escuelas[Math.min(2, Math.floor(azar() * 3))] : a.escuelas[0];
    const v = escuela(e);
    // `if ( DMG_AMT < 15 ) callevent magic_skill_cancel`, ANTES del `multiply`
    // (bows_telf4.script:50, :80-83).
    if (a.sorteo && v < 15) mensajes.push(`The projectile fails to form due to your lack of ${e} affinity.`);
    let d = v * a.ajuste;
    if (corto) d *= 0.1;
    return { e, d };
  };
  let r = tirada();
  if (a.sorteo) r = tirada();
  return {
    dano: r.d, tipo: TIPO_DE_ESPIRAL[r.e], escuela: r.e, nombre: NOMBRE_DE_ESPIRAL[r.e],
    mensajes, cancela: mensajes.length > 0, cortoDeArqueria: corto,
  };
}

/**
 * EL RELOJ DE UN ÁREA EN VUELO: cuántos golpes tocan con la flecha a `vida`
 * segundos, sabiendo que el siguiente estaba en `proximo`. Devuelve los
 * instantes y el próximo nuevo. `callevent 0.01 damage_area` y luego `callevent
 * <periodo>` dentro de cada uno; a los `vida` segundos `remove_me` lo apaga.
 */
export function golpesDeVuelo(id, proximo, vida) {
  const v = PROYECTILES_DE_GUION[id]?.vuelo;
  if (!v) return { instantes: [], proximo };
  const instantes = [];
  let p = proximo ?? v.primero;
  // Un tope por si `vida` llega como infinito: nunca más de lo que cabe en 10 s.
  while (p <= vida && p < v.vida && instantes.length < 200) { instantes.push(p); p += v.periodo; }
  return { instantes, proximo: p };
}

/** Las que este puerto corre y las que no, CALCULADAS. */
export function cuentaDeProyectilesDeGuion() {
  const todos = Object.entries(PROYECTILES_DE_GUION);
  return {
    total: todos.length,
    portados: todos.filter(([, r]) => r.portado).map(([id]) => id),
    sinPortar: todos.filter(([, r]) => !r.portado).map(([id]) => id),
  };
}
