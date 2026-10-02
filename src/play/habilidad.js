// `$get(<ent>, skill.<habilidad>.<propiedad>)` — el 66.
//
// Es lo que gradúa casi todo efecto de objeto: cuánto cura un hechizo, cuánto
// aguanta un escudo, cuánto dura un aura. Y no es un nombre de propiedad sino
// una FAMILIA, que el motor reconoce por el prefijo:
//
//     else if (Prop.starts_with("skill."))
//     {
//       int SubSkill = -1;
//       if (Prop.contains(".prof"))          SubSkill = 0;
//       else if (Prop.contains(".balance"))  SubSkill = 1;
//       else if (Prop.contains(".power"))    SubSkill = 2;
//       else if (Prop.contains(".fire"))     SubSkill = 0;   //Magic
//       else if (Prop.contains(".ice"))      SubSkill = 1;
//       else if (Prop.contains(".lightning"))  SubSkill = 2;
//       else if (Prop.contains(".divination")) SubSkill = 3;
//       else if (Prop.contains(".affliction")) SubSkill = 4;
//
//       int Max = (SubSkill > -1) ? (int)STATPROP_MAX_VALUE : (int)STAT_MAX_VALUE;
//       if (Prop.contains(".max")) RETURN_INT(Max)
//       else {
//         msstring Skill = Prop.substr(6).thru_char(".");
//         int Stat = GetSkillStatByName(Skill);
//         if (Stat > -1) {
//           int Amount;
//           if (SubSkill > -1) Amount = pPlayer->GetSkillStat(Skill.c_str(), SubSkill);
//           else Amount = pPlayer->GetSkillStat(Stat);
//           if (Prop.contains(".ratio")) RETURN_FLOAT_PRECISION(Amount / (float)Max)
//           else RETURN_INT(Amount);
//         }
//         else ALERT(at_console, "Player skill %s doesn't exist!\n", Skill.c_str());
//       }
//     }
//                                            scriptcmds.cpp:1651-1681
//
// Cuatro cosas de esas veinte líneas que no se adivinan y cambian el resultado:
//
//  1. **Las subhabilidades se buscan con `contains`, no con igualdad.** Así que
//     `skill.spellcasting.divination.ratio` funciona, y también funcionaría
//     `skill.lo_que_sea.power_de_mentira`.
//  2. **Los índices de magia y de armas se solapan**: `.prof` y `.fire` son los
//     dos el 0. No es un fallo: el índice es la posición dentro de las
//     propiedades de ESA habilidad, y una de armas tiene tres y `spellcasting`
//     tiene cinco.
//  3. **El tope depende de si pediste una propiedad o la habilidad entera**:
//     100 para una propiedad, 300 para la habilidad (`statdefs.h:75-76`).
//  4. **`.max` se comprueba ANTES de mirar si la habilidad existe**, así que
//     `skill.no_existe.max` contesta el tope igual. Va portado así.
//
// Y el número que devuelve es un **entero** (`RETURN_INT`) salvo con `.ratio`:
// una habilidad a 37,8 contesta 37, y las cuentas del guion se hacen con eso.
//
// ── LA TRAMPA DE LOS DOS `GetSkillStat` ─────────────────────────────────────
//
// Sin subhabilidad el motor llama a `GetSkillStat(Stat)`, que **no es** el
// `GetSkillStat(idx, prop)` de al lado:
//
//     int GetSkillStat(int iStatIdx) { return GetStat(iStatIdx, 1); }
//                                            msmonster.h:416
//
// Va por `GetStat`, cae al final en `TheStat->Value()`
// (msmonstershared.cpp:572-573) y ése es **la media redondeada con suelo de
// uno**, no la propiedad 0 ni la suma (`stats.cpp:145-173`). Dos funciones con
// el mismo nombre y un argumento de diferencia que devuelven cosas distintas:
// confundirlas da un número plausible y falso, así que aquí se usa la
// traducción que el puerto ya tenía, `valorDeHabilidad`.
//
// Y con subhabilidad va por `GetSkillStat(const char*, int)`, que ante un
// índice fuera de rango devuelve **0** —no −1 como `CStat::Value(int)`—:
//
//     if (!pStat || StatProperty >= (signed)pStat->m_SubStats.size()) return 0;
//                                            msmonstershared.cpp:476-483
//
// O sea que `skill.parry.power` —la tercera propiedad de una habilidad que
// tiene UNA— contesta 0 y no un error.

import { HABILIDADES, propiedadesDe, valorDeHabilidad } from "../juego/stats.js";

/** `STAT_MAX_VALUE` y `STATPROP_MAX_VALUE`. `statdefs.h:75-76`. */
export const TOPE_HABILIDAD = 300;
export const TOPE_PROPIEDAD = 100;

/**
 * Las subhabilidades y su índice, **en el orden en que el motor las prueba**.
 *
 * El orden importa porque son `contains`: el primero que case gana. Y los dos
 * grupos comparten números a propósito (ver el punto 2 de arriba).
 */
export const SUBHABILIDADES = Object.freeze([
  [".prof", 0], [".balance", 1], [".power", 2],
  [".fire", 0], [".ice", 1], [".lightning", 2], [".divination", 3], [".affliction", 4],
]);

/** El valor de una propiedad guardada, que el puerto guarda como `{valor, exp}`. */
function valorDe(guardado) {
  if (guardado === null || guardado === undefined) return 0;
  const v = typeof guardado === "object" ? guardado.valor : guardado;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Contesta un `skill.…` como lo contesta el motor.
 *
 * @param {object} personaje  el personaje, con sus `habilidades`
 * @param {string} prop       la propiedad entera, incluido el `skill.`
 * @returns {string} lo que devolvería `$get`. Nunca `null`: el motor contesta
 *          «0» a lo que no sabe (`GetProp` acaba en `fSuccess ? "1" : "0"`).
 */
export function habilidadDeGuion(personaje, prop) {
  const nombre = String(prop ?? "");
  if (!nombre.startsWith("skill.")) return "0";

  // 1. La subhabilidad, por `contains` y en el orden del motor.
  let sub = -1;
  for (const [aguja, idx] of SUBHABILIDADES) {
    if (nombre.includes(aguja)) { sub = idx; break; }
  }
  const tope = sub > -1 ? TOPE_PROPIEDAD : TOPE_HABILIDAD;

  // 2. `.max` gana antes de mirar si la habilidad existe. Tal cual el motor.
  if (nombre.includes(".max")) return String(tope);

  // 3. La habilidad: `Prop.substr(6).thru_char(".")` — lo que hay entre
  //    `skill.` y el siguiente punto.
  const resto = nombre.slice("skill.".length);
  const clave = resto.split(".")[0];
  const hab = HABILIDADES.find((h) => h.clave === clave);
  // «Player skill %s doesn't exist!» y no devuelve nada, o sea «0».
  if (!hab) return "0";

  const props = propiedadesDe(clave);
  const guardadas = personaje?.habilidades?.[clave] ?? null;

  let cantidad;
  if (sub > -1) {
    // Una propiedad concreta, y **0 si el índice se sale**: es el caso de
    // `skill.parry.power`, la tercera de una habilidad que tiene una
    // (msmonstershared.cpp:480).
    cantidad = sub < props.length ? valorDe(guardadas?.[props[sub]]) : 0;
  } else {
    // La habilidad entera, que es `CStat::Value()`: media redondeada con suelo
    // de uno. Ver la nota de arriba sobre los dos `GetSkillStat`.
    cantidad = valorDeHabilidad(guardadas ?? {});
  }

  if (nombre.includes(".ratio")) return String(cantidad / tope);
  // `RETURN_INT`: se trunca, no se redondea.
  return String(Math.trunc(cantidad));
}
