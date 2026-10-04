// EL PARRY — la otra mitad del combate de Master Sword.
//
// Aquí hay una sorpresa que cambia el diseño entero, y es la razón de que este
// fichero tenga DOS reglas y no una: **Rebirth tiene dos parries distintos, y
// cada uno sirve a un bando.**
//
//   1. El del MOTOR, en `CMSMonster::TraceAttack` (msmonsterserver.cpp:2110).
//      Lee la estadística `parry` y la consciencia, tope 60 y tirada tope 80,
//      ocho tipos de daño que no se paran, y deja el daño en **-1**.
//
//   2. El del SCRIPT, en `game_damaged` de `base_monster_shared.script:843`.
//      Lee el scriptvar `MONSTER_PARRY`, tirada tope 90, dos tipos que no se
//      paran, y hace `return 0`, que multiplica el daño **por cero**.
//
// Parecen uno viejo y uno nuevo, y lo primero que escribí fue que el del script
// estaba muerto, porque `MONSTER_PARRY` **no lo pone ningún script**: las 723
// fichas de `monsters/` no lo mencionan. Lo pone el MOTOR, en el comando
// `setstat` (npcscript.cpp:1299-1312):
//
//     if (!IsPlayer())
//         if (msInputStatName == "parry")
//             SetScriptVar("MONSTER_PARRY", atof(Params[1]));
//     if (IsPlayer())
//         ...aquí, y sólo aquí, se escriben las substats de verdad...
//
// O sea que `setstat parry 50` en un monstruo **no le da la estadística**: le da
// el scriptvar. Y de ahí salen las tres consecuencias que importan:
//
//   - Un MONSTRUO nunca para con la regla del motor, porque su estadística
//     `parry` se queda en 0 haga lo que haga su ficha.
//   - Un MONSTRUO para con la del script, que es la única que lee el scriptvar.
//   - Un JUGADOR es al contrario: `update_parry` le pone la estadística de
//     verdad (`setstat` por la rama de `IsPlayer`) y su `game_damaged` no lleva
//     ese bloque, así que para sólo con la del motor.
//
// Y de paso: `setstat awareness 20`, que la araña también pone, **no hace nada
// en un monstruo**. La consciencia sólo suma en la regla del motor, que es la
// que el monstruo no usa. Una línea muerta al lado de una que sí cuenta.
//
// Nada de esto se puede adivinar leyendo los scripts, y es la clase de cosa por
// la que este proyecto lee el motor: las dos reglas dan probabilidades distintas
// para el mismo número.

import { valorDeHabilidad } from "../juego/stats.js";

/** El tope de la estadística. «cap out parry (shhh)» — msmonsterserver.cpp:2135. */
export const TOPE_DE_PARRY = 60;
/** Y el de la tirada: «always allow at least 20% chance to be hit». */
export const TOPE_DE_TIRADA_DEL_MOTOR = 80;
/** El del script es otro, y más alto: 90. `base_monster_shared.script:851`. */
export const TOPE_DE_TIRADA_DEL_SCRIPT = 90;

/**
 * Los ocho tipos que el MOTOR no deja parar (msmonsterserver.cpp:2160-2177).
 * Siete por prefijo y uno por contenido, y así están escritos.
 */
export const NO_SE_PARA_EN_EL_MOTOR = {
  prefijos: ["target", "fire", "poison", "lightning", "cold", "magic"],
  contiene: ["effect"],
};

/**
 * Y los del SCRIPT, que son dos y una lista: `NPC_CANT_PARRY_TYPES "target;magic"`.
 *
 * La comparación del motor de scripts es de SUBCADENA y al revés de lo que
 * parece: `if (NPC_CANT_PARRY_TYPES contains PARAM3)` pregunta si la lista
 * contiene el tipo, así que un tipo vacío la cumple — y un tipo vacío es lo que
 * llega cuando el ataque no declara `dmg.type`.
 */
export const NO_SE_PARA_EN_EL_SCRIPT = { lista: "target;magic", contiene: ["effect"] };

const dado = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

/**
 * La tirada del ATACANTE, que se hace una vez por golpe y la comparten las dos
 * reglas: `Damage.AccuracyRoll = flHitPercentage - RANDOM_LONG(0,99)`
 * (giattack.cpp:1661-1689). Con `flHitPercentage` = 100 —que es lo que vale
 * siempre en Rebirth, ver `golpe.js`— sale un entero de 1 a 100.
 *
 * No es «la puntería»: es el SUELO de la tirada siguiente. Cuanto mejor sale,
 * más difícil es que te la paren, porque `rand(acierto, 100)` empieza más arriba.
 */
export function aciertoDelGolpe({ tope = 100, tirada = null } = {}) {
  return tope - (tirada ?? dado(0, 99));
}

/**
 * EL PARRY DEL BICHO — la regla del script, que es la que corre en Gate City.
 *
 * ```
 * if MONSTER_PARRY > 0
 * local ACCU_ROLL  $rand(PARAM4,100)        // PARAM4 = el acierto del golpe
 * local PARRY_ROLL $rand(1,MONSTER_PARRY)
 * if ( PARRY_ROLL > 90 ) local PARRY_ROLL 90
 * if PARRY_ROLL > ACCU_ROLL
 * callevent game_parry ATTACKER_ID
 * return 0
 * ```
 *
 * El tope se aplica DESPUÉS de tirar, que no es lo mismo que tirar `rand(1,90)`:
 * con parry 500 la tirada sale 90 el 82 % de las veces. No lo cambio.
 */
export function parryDelBicho({ parry = 0, acierto = 1, tipo = "", tiradas = {} } = {}) {
  if (!(parry > 0)) return { para: false, porque: "sin parry" };
  const t = String(tipo ?? "");
  if (NO_SE_PARA_EN_EL_SCRIPT.lista.includes(t)) return { para: false, porque: `tipo ${t || "(vacío)"}` };
  if (NO_SE_PARA_EN_EL_SCRIPT.contiene.some((c) => t.includes(c))) return { para: false, porque: `tipo ${t}` };
  const acc = tiradas.acierto ?? dado(acierto, 100);
  const bruta = tiradas.parry ?? dado(1, parry);
  const tirada = Math.min(bruta, TOPE_DE_TIRADA_DEL_SCRIPT);
  return { para: tirada > acc, tirada, acc, porque: tirada > acc ? "parry" : "no llega" };
}

/**
 * EL PARRY DEL JUGADOR — la regla del motor.
 *
 * ```
 * int ParryValue = GetSkillStat("parry", STATPROP_SKILL);
 * if (ParryValue > 60) ParryValue = 60;
 * int AccRoll = RANDOM_LONG(Damage.AccuracyRoll, 100),
 *     ParryRoll = RANDOM_LONG(0, ParryValue);
 * ParryRoll += GetNatStat(NATURAL_AWR);
 * ...ocho tipos que lo ponen a 0...
 * if (ParryRoll > 80) ParryRoll = 80;
 * if (ParryRoll > AccRoll) { ...game_parry...; Damage.flDamage = -1; }
 * ```
 *
 * El daño 0 tampoco se para («do not parry 0 damage atks»), y eso importa:
 * el escudo corre ANTES (`Gear[i]->OwnerTakeDamage` en player.cpp:405), así que
 * un escudo que anule el golpe deja al parry sin nada que parar.
 */
export function parryDelJugador({
  parry = 0, consciencia = 0, acierto = 1, tipo = "", dano = 1, tiradas = {},
} = {}) {
  const valor = Math.min(parry, TOPE_DE_PARRY);
  const acc = tiradas.acierto ?? dado(acierto, 100);
  const t = String(tipo ?? "").toLowerCase();
  let tirada = (tiradas.parry ?? dado(0, Math.max(0, valor))) + consciencia;
  let porque = null;
  if (NO_SE_PARA_EN_EL_MOTOR.prefijos.some((p) => t.startsWith(p))) porque = `tipo ${t}`;
  else if (NO_SE_PARA_EN_EL_MOTOR.contiene.some((c) => t.includes(c))) porque = `tipo ${t}`;
  else if (dano === 0) porque = "daño 0";
  if (porque) tirada = 0;
  tirada = Math.min(tirada, TOPE_DE_TIRADA_DEL_MOTOR);
  const para = tirada > acc;
  return { para, tirada, acc, valor, porque: porque ?? (para ? "parry" : "no llega") };
}

/**
 * CUÁNTO PARRY TIENE EL JUGADOR. `update_parry`, en
 * `scripts/player/externals.script:638-698`, y no es una habilidad aparte:
 *
 *   - Cada mano aporta **la competencia de la habilidad de su arma** —la
 *     `skill.` a secas, no la potencia—, ×1,5 si es a dos manos y no es
 *     marciales, 0 si es puño desnudo y 0 si es escudo.
 *   - Un escudo en vez de aportar MULTIPLICA: suma su `PARRY_MULTI` (1,3 en la
 *     base) al multiplicador, y luego se le resta 1 si pasa de 1.
 *   - Escudo + puño desnudo usa la competencia de marciales.
 *   - `setstat parry $int(total × multi)`.
 *
 * O sea que **el parry de un jugador es su competencia con el arma que lleva.**
 * Y de ahí sale la cifra que manda en esta demo: un personaje nuevo tiene
 * competencia 0 en todo —`CreateChar` reparte un punto a la POTENCIA, no a la
 * competencia—, así que su parry es 0 y no para nada. Igual que hace 1 % del
 * daño, para el 0 % de los golpes.
 */
export function valorDeParryDelJugador({ manos = [] } = {}) {
  let multi = 1.0;
  let total = 0;
  for (const m of manos) {
    if (m?.escudo) { multi += m.multiplicadorDeParry ?? 0; continue; }
    if (m?.punoDesnudo) continue;
    let v = m?.competencia ?? 0;
    if (m?.dosManos && m?.habilidad !== "martialarts") v *= 1.5;
    total += v;
  }
  if (multi > 1.0) multi -= 1.0;
  // Escudo + puño desnudo: la competencia de marciales por el multiplicador.
  if (total === 0 && multi > 1.0) total = manos.find((m) => m?.marciales)?.marciales ?? 0;
  return Math.trunc(total * multi);
}

/**
 * LAS MANOS DE `update_parry`, sacadas del personaje — el 97.
 *
 * Hasta el 96 esto vivía dentro de `parryDelPersonaje` en src/main.js, que es
 * el único que lo pedía. Con servidor lo pide también `Partida._bichoPega`
 * (la defensa del jugador en el servidor, doc/DEFENSARED_97.md), y copiarlo
 * habría dado dos `update_parry` que pueden separarse sin un error. Así que
 * vive aquí y lo llaman los dos.
 *
 * @param {object} habilidades  las del personaje (`personaje.habilidades`)
 * @param {object} arma         la ficha del arma de la mano: `id`, `habilidad`
 *                              (o `arma.habilidad` en el catálogo de objetos)
 *                              y `manoNumero` (4 = a dos manos)
 * @param {object} escudo       la ficha `escudo` del escudo embrazado, o `null`
 */
export function manosDelParry({ habilidades = null, arma = null, escudo = null } = {}) {
  const compDe = (hab) => (hab && habilidades?.[hab] ? valorDeHabilidad(habilidades[hab]) : 0);
  const manos = [];
  if (arma) {
    const habilidad = arma.habilidad ?? arma.arma?.habilidad ?? arma.ataques?.[0]?.habilidad ?? null;
    manos.push({
      habilidad,
      competencia: compDe(habilidad),
      punoDesnudo: arma.id === "fist_bare",
      dosManos: arma.manoNumero === 4,
      marciales: compDe("martialarts"),
    });
  }
  if (escudo) manos.push({ escudo: true, multiplicadorDeParry: escudo.multiplicadorDeParry ?? 0 });
  return manos;
}

/**
 * La probabilidad exacta de cada regla, sumando sobre los tres dados. Sirve para
 * las pruebas y para la sonda: una tirada medida se compara contra ESTO y no
 * contra un número escrito a mano.
 */
export function probabilidadDeParry(regla, { parry, consciencia = 0, tope = 100 } = {}) {
  let p = 0;
  for (let a = 0; a <= 99; a++) {          // el dado del atacante
    const acierto = tope - a;
    const nAcc = 100 - acierto + 1;         // rand(acierto, 100)
    for (let acc = acierto; acc <= 100; acc++) {
      const desde = regla === "bicho" ? 1 : 0;
      const nP = parry - desde + 1;
      if (nP <= 0) continue;
      for (let d = desde; d <= parry; d++) {
        const t = regla === "bicho"
          ? Math.min(d, TOPE_DE_TIRADA_DEL_SCRIPT)
          : Math.min(d + consciencia, TOPE_DE_TIRADA_DEL_MOTOR);
        if (t > acc) p += 1 / (100 * nAcc * nP);
      }
    }
  }
  return p;
}
