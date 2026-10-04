// LA ARMADURA PUESTA — el 96.
//
// Lo primero que hay que saber, porque es lo contrario de lo que dice la ficha:
// **la protección de una armadura de Master Sword no la calcula el motor**. La
// calcula su guion, y el motor sólo le pasa el golpe:
//
//     for (int i = 0; i < Gear.size(); i++)
//         Gear[i]->OwnerTakeDamage(Damage);                player.cpp:403-404
//
//     void CGenericItem::OwnerTakeDamage(damage_t &Damage) {
//         if (IsArmor() && IsWorn()) Damage.flDamage = Armor_Protect(Damage);
//         ...
//         m_CurrentDamage = &Damage;
//         CallScriptEvent("game_takedamage", &Params);   giattack.cpp:1161-1176
//
// `Armor_Protect` sí resta un porcentaje —`flDamage * ((100 - Protection) *
// 0.01)`, giarmor.cpp:112—, pero `Protection` es `atof(ARMOR_PROTECTION)` y la
// plantilla de TODAS las armaduras lo pone a cero justo antes de registrarse:
//
//     setvard ARMOR_PROTECTION 0          items/armor_base.script:37
//     registerarmor                                               :41
//
// Así que la cuenta del C++ multiplica por 1,0 siempre, y lo que protege es el
// `game_takedamage` de la plantilla (armor_base.script:191-238):
//
//     DMG_REDUCT = 1 - BARMOR_PROTECTION * 0.01        (:48-51, en game_spawn)
//     si el tipo CONTIENE «poison»   -> daño × 0,5, con armadura o sin ella
//     si no, y el atacante no tiene NPC_IGNORES_ARMOR -> daño × DMG_REDUCT
//     setdmg dmg <eso>
//
// Por eso este archivo NO tiene una tabla de porcentajes: corre el guion de
// cada pieza puesta, en orden, con su `setdmg`. El 55 % del fénix sale de su
// `const BARMOR_PROTECTION 55%` pasado por el `multiply` del intérprete, que es
// `atof` y se come el «%».
//
// ── LOS FALLOS DEL ORIGINAL, QUE SE PORTAN ─────────────────────────────────
//
//   1. LA ZONA NO CUENTA. `TraceAttack` sortea la zona del golpe
//      (`RANDOM_LONG(0, HUMAN_BODYPARTS - 1)`, player.cpp:398) y la apunta en
//      `Damage.iHitGroup`, pero la comprobación que la miraba está comentada
//      dos veces en `Armor_Protect` (giarmor.cpp:85-101): «no go BodyPartIdx
//      udeclared identifier». `BARMOR_PROTECTION_AREA "chest;arms;legs"` sólo
//      decide qué partes del muñeco se dibujan. **Una coraza te protege la
//      cabeza.** Por eso aquí no se sortea zona: sería un dado sin efecto.
//
//   2. EL YELMO NO PROTEGE DEL DAÑO. `armor_helm_gray` declara
//      `BARMOR_PROTECTION 60%` pero incluye `armor_base_helmet`, que NO incluye
//      `armor_base`: ni `registerarmor` ni `game_takedamage`. Su 60 % no lo lee
//      nadie. Lo único que hace un yelmo es `set_stun_prot` —el aturdimiento—
//      por `callexternal`, y eso corre por su guion sin pasar por aquí.
//
//   3. LAS PIEZAS SE MULTIPLICAN. Cada `game_takedamage` lee el daño que dejó
//      la anterior (`PARAM3`, que es `Damage.flDamage` en ese momento) y lo
//      vuelve a escribir. Dos piezas del 55 % no dan 110 %: dan 0,45 × 0,45.
//      En la práctica no hay dos: las armaduras de cuerpo piden todas `chest`,
//      que tiene UNA plaza (player_sh_stats.script:11).
//
//   4. `CanWearItem` SUMA CON EL ÍNDICE QUE NO ES. Ver `puedeVestir`.
//
// ── LO QUE NO SE PORTA AQUÍ ────────────────────────────────────────────────
//
// El `game_takedamage` de lo que no es armadura ni está puesto: el motor se lo
// manda a todo el `Gear`, y 15 armas lo tienen (astas, mandobles). Su regla no
// está portada y aquí no se les llama. A una armadura en la mochila SÍ, como
// en el motor: la que corta es la primera línea de su guion,
// `if $get(ent_me,is_worn)`. El escudo va por `src/play/escudo.js`.

import { flotanteDelMotor } from "./guion.js";
import { QUIEN_VISTE } from "./guionobjeto.js";

/**
 * Las posiciones del jugador y cuántas plazas tiene cada una.
 * `game_reset_wear_positions`, player/player_sh_stats.script:6-30.
 */
export const POSICIONES_DEL_JUGADOR = Object.freeze({
  head: 1, neck: 1, chest: 1, back: 3, shoulder: 1, bow: 2, arms: 2,
  rightarm: 1, leftarm: 1, righthand: 1, lefthand: 1, rightfinger: 10,
  leftfinger: 10, waist: 2, belt: 8, hip: 2, legs: 1, rightthigh: 1,
  leftthigh: 1, rightfoot: 1, leftfoot: 1,
});

/**
 * Las plazas que ocupa una pieza en cada posición. `wearable <plazas> <sitios>`
 * pone el MISMO número en todas (genericitem.cpp:1839), y en los 2 884 guiones
 * ese número es 1 las 64 veces que no es 0. Se calcula, no se supone: si un día
 * hay un `wearable 2`, la ficha lo tiene que traer.
 */
const plazasDe = (ficha) => Number.isFinite(ficha?.plazas) ? ficha.plazas : 1;

/**
 * ¿CABE? `CGenericItem::CanWearItem`, genericitem.cpp:1035-1120.
 *
 * Con su fallo. Para cada posición `iloc` de la pieza nueva recorre lo que
 * llevas puesto, y cuando una pieza puesta tiene esa posición en SU índice
 * `iwloc`, suma
 *
 *     iSlots += pItemWorn->m_WearPositions[iloc].Slots;      :1088
 *
 * con `iloc` —el índice de la pieza NUEVA— y no `iwloc`. Como todas las plazas
 * valen 1 y todas las armaduras del juego empiezan por `chest;arms`, en los
 * datos de Master Sword no se nota nunca; se nota si la puesta tiene MENOS
 * posiciones que `iloc`, y entonces el motor lee fuera de la lista (`mslist`
 * no comprueba, stackstring.h:86-89). Aquí eso vale 0, que es una elección
 * nuestra para algo que en el motor es memoria cualquiera.
 *
 * Los mensajes son los de `SendInfoMsg`, con el salto de línea que llevan.
 *
 * @param {object}   ficha    la ficha del objeto (`vestible`, `ranuras`, `nombre`)
 * @param {object[]} puestas  las fichas de lo que ya llevas puesto, en orden
 */
export function puedeVestir({ ficha, puestas = [], posiciones = POSICIONES_DEL_JUGADOR } = {}) {
  // `if (!m_pOwner || !FBitSet(MSProperties(), ITEM_WEARABLE)) return false;` — sin mensaje.
  if (!ficha?.vestible) return { puede: false, mensaje: null, porque: "no es vestible" };
  const nombre = ficha.nombre ?? ficha.id;
  const mias = ficha.ranuras ?? [];
  for (let iloc = 0; iloc < mias.length; iloc++) {
    const pos = mias[iloc];
    if (!Object.hasOwn(posiciones, pos)) {
      return { puede: false, mensaje: `You can't wear ${nombre}\n`, porque: `el jugador no tiene «${pos}»` };
    }
    const max = posiciones[pos];
    let plazas = 0;
    let conflicto = null;
    for (const otra of puestas) {
      if (!otra?.vestible || otra === ficha) continue;
      const suyas = otra.ranuras ?? [];
      const iwloc = suyas.indexOf(pos);
      if (iwloc < 0) continue;
      // EL FALLO: `[iloc]`, no `[iwloc]`.
      plazas += iloc < suyas.length ? plazasDe(otra) : 0;
      conflicto = otra;
    }
    plazas += plazasDe(ficha);
    if (plazas > max) {
      const mensaje = max === 0 ? `You can't wear ${nombre}\n`
        : max === 1 ? (conflicto ? `You have no more ${pos} slots\n` : `You can't wear ${nombre}\n`)
          : `You have no more ${pos} slots\n`;
      return { puede: false, mensaje, porque: `${pos}: ${plazas} de ${max}` };
    }
  }
  return { puede: true, mensaje: null, porque: null };
}

/**
 * PONÉRSELA. `CGenericItem::WearItem`, genericitem.cpp:1123-1145.
 *
 * El ORDEN importa y es éste: primero `game_wear` y DESPUÉS
 * `m_Location = ITEMPOS_BODY`. O sea que **mientras corre `game_wear` la pieza
 * todavía no está puesta**, y lo que el guion quiere hacer «ya puesta» lo
 * aplaza: `callevent 0.1 barmor_effect_activate` (base_effect_armor.script:7)
 * o `callevent 0.1 failed_str_req_loop` (armor_base.script:100), cuya primera
 * línea es `if $get(ent_me,is_worn)`.
 *
 * @param {object} entrada   la entrada de `personaje.objetos`, que guarda `puesto`
 * @param {object} ficha     su ficha del catálogo
 * @param {GuionDeObjeto} objeto  su entidad con guion (o `null` si no está horneado)
 * @param {object[]} puestas las fichas de lo que ya lleva puesto
 */
export function vestir({ entrada, ficha, objeto = null, puestas = [], raza = "human", genero = "male" } = {}) {
  if (entrada?.puesto) return { puesto: true, mensaje: null, porque: "ya puesto" };
  const c = puedeVestir({ ficha, puestas });
  if (!c.puede) return { puesto: false, mensaje: c.mensaje, porque: c.porque };
  objeto?.llamar("game_wear", [raza, genero === "female" ? "female" : "male", QUIEN_VISTE.JUGANDO]);
  if (entrada) entrada.puesto = true;
  if (objeto) objeto.puesto = true;
  return { puesto: true, mensaje: null, porque: null };
}

/**
 * EL GOLPE CONTRA LO QUE LLEVAS PUESTO, en el orden del `Gear`.
 *
 * Por cada pieza puesta:
 *   1. si registró armadura, `Armor_Protect` (giarmor.cpp:76-137): el
 *      porcentaje del C++, que con `ARMOR_PROTECTION 0` multiplica por 1. Su
 *      `game_protect` no lo declara ningún guion del juego, así que no hay
 *      `m_ReturnData` que lo pise.
 *   2. `game_takedamage <atacante> <infligidor> <daño «%.2f»> <tipo>`
 *      (giattack.cpp:1166-1174), con el golpe en curso para que `setdmg` lo
 *      cambie.
 *
 * Devuelve el golpe como queda —`dano`, `tipo`, `acierto`— y, para medir, qué
 * hizo cada pieza.
 *
 * @param {GuionDeObjeto[]} equipo  las entidades de lo que lleva, en orden
 */
export function golpeContraLaArmadura({
  dano = 0, tipo = "", atacante = "none", infligidor = "none", equipo = [],
} = {}) {
  const golpe = { dano: Number(dano) || 0, tipo: String(tipo ?? ""), acierto: true };
  const piezas = [];
  for (const o of equipo) {
    // A quién: a lo PUESTO y a toda pieza que registró armadura, puesta o no.
    // El motor se lo manda a todo el `Gear` y es el guion quien mira
    // `is_worn` (armor_base.script:193); se deja que lo mire él para que esa
    // línea mande de verdad. Lo que no es armadura y no está puesto se queda
    // fuera: las armas con `game_takedamage` no están portadas (ver arriba).
    if (!o?.puesto && !o?.armadura) continue;
    const antes = golpe.dano;
    // `if (IsArmor() && IsWorn())` — giattack.cpp:1164.
    if (o.armadura && o.puesto) golpe.dano = golpe.dano * ((100 - o.armadura.proteccion) * 0.01);
    o.golpeEnCurso = golpe;
    try {
      o.llamar("game_takedamage", [String(atacante), String(infligidor), flotanteDelMotor(golpe.dano), golpe.tipo]);
    } finally {
      o.golpeEnCurso = null;
    }
    piezas.push({ id: o.id, antes, despues: golpe.dano, armadura: Boolean(o.armadura) });
  }
  return { ...golpe, piezas };
}

/**
 * ¿Se le manda `game_wear` al cargar? A lo que no es armadura, sí —es lo que
 * este puerto hacía desde el 66 con todo (`GuionDeObjeto.arrancar`)—; a una
 * armadura o un yelmo, sólo si está PUESTO. Una armadura en la mochila que
 * corre su `game_wear` registra su resistencia elemental y su aturdimiento
 * (base_elemental_resist.script:71-73, armor_base_helmet.script:85-104) sin
 * estar puesta.
 */
export function seVisteAlCargar(ficha, entrada) {
  if (!esArmaduraOYelmo(ficha)) return true;
  return Boolean(entrada?.puesto);
}

/** Lo que el 96 trata como armadura: registra armadura o es un yelmo. */
export function esArmaduraOYelmo(ficha) {
  if (!ficha?.vestible) return false;
  return (ficha.tipos ?? []).includes("armadura") || /^armor_helm_/.test(String(ficha.id ?? ""));
}

/**
 * EL 98: LAS PIEZAS CUYO GUION CORRE EN EL SERVIDOR cuando lo hay. Son las
 * que `Partida._equipoDe` monta para la defensa —lo puesto y toda armadura—,
 * y desde el 98 también las que mueve su reloj allí (`Partida._paso`): el
 * `callevent 0.1 failed_str_req_loop` de `game_wear` y su `applyeffect
 * ent_owner effects/effect_slow` (armor_base.script:100, :173-181). El
 * guion de una armadura es `//#scope server` (armor_base.script:2). El
 * navegador NO mueve el reloj de éstas con servidor: serían dos lentitudes y
 * dos avisos por cada vuelta del bucle.
 */
export function correEnElServidor(ficha, puesto) {
  return Boolean(puesto) || esArmaduraOYelmo(ficha);
}

/** Las fichas de lo puesto, en el orden de la mochila. */
export function fichasPuestas(objetos = [], fichaDe = () => null) {
  return objetos.filter((o) => o?.puesto).map((o) => fichaDe(o.id)).filter(Boolean);
}
