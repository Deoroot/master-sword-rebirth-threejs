// `$get(<ent>, skill.…)`, QUE TIENE MÁS REGLAS DE LAS QUE PARECE — el 66.
//
// Es lo que gradúa casi todo efecto de objeto —cuánto cura un hechizo, cuánto
// aguanta un escudo— y no estaba portado: `$get` lo mandaba al cajón de «no
// soportado» y devolvía 0, así que la curación pasiva del hechizo de rejuvenecer
// salía a su valor de base para todo el mundo. Las citas están en
// `src/play/habilidad.js`.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  habilidadDeGuion, SUBHABILIDADES, TOPE_HABILIDAD, TOPE_PROPIEDAD,
} from "../src/play/habilidad.js";

/** Un personaje con la forma del juego: `{valor, exp}` por propiedad. */
const conMagia = (divinacion) => ({
  habilidades: {
    spellcasting: {
      fire: { valor: 1, exp: 0 }, ice: { valor: 1, exp: 0 },
      lightning: { valor: 1, exp: 0 }, divination: { valor: divinacion, exp: 0 },
      affliction: { valor: 1, exp: 0 },
    },
    swordsmanship: {
      proficiency: { valor: 10, exp: 0 }, balance: { valor: 20, exp: 0 }, power: { valor: 30, exp: 0 },
    },
    parry: { proficiency: { valor: 7, exp: 0 } },
  },
});

describe("las reglas de `skill.…` (66)", () => {
  test("los topes son los del motor", () => {
    // `statdefs.h:75-76`. Uno por propiedad y otro por habilidad entera.
    assert.equal(TOPE_PROPIEDAD, 100);
    assert.equal(TOPE_HABILIDAD, 300);
  });

  test("una propiedad concreta sale tal cual", () => {
    assert.equal(habilidadDeGuion(conMagia(60), "skill.spellcasting.divination"), "60");
    assert.equal(habilidadDeGuion(conMagia(60), "skill.swordsmanship.power"), "30");
    assert.equal(habilidadDeGuion(conMagia(60), "skill.swordsmanship.balance"), "20");
  });

  test("y `.prof` vale para `proficiency`: se busca por `contains`", () => {
    // `if (Prop.contains(".prof")) SubSkill = 0;` — no es una igualdad, así que
    // las dos formas que usan los guiones funcionan.
    assert.equal(habilidadDeGuion(conMagia(60), "skill.swordsmanship.prof"), "10");
    assert.equal(habilidadDeGuion(conMagia(60), "skill.swordsmanship.proficiency"), "10");
  });

  // ── LA HABILIDAD ENTERA, QUE NO ES LA SUMA NI LA PROPIEDAD 0 ──────────────
  test("sin propiedad es la MEDIA redondeada con suelo de uno", () => {
    // Es la trampa de los dos `GetSkillStat`: el de un argumento va por
    // `GetStat(idx, 1)` y acaba en `CStat::Value()` (msmonster.h:416,
    // msmonstershared.cpp:572, stats.cpp:145-173). Con (10,20,30) la media es
    // 20; la suma sería 60 y la propiedad 0 sería 10, así que los tres valores
    // son distintos y el control discrimina.
    assert.equal(habilidadDeGuion(conMagia(60), "skill.swordsmanship"), "20");
    // Y las cinco escuelas con (1,1,1,60,1): (64 + 2) / 5 = 13.
    assert.equal(habilidadDeGuion(conMagia(60), "skill.spellcasting"), "13");
  });

  test("y el suelo de uno existe: nada baja de 1", () => {
    // `return (iVal == 0) ? 1 : iVal;` — es lo que hace que un personaje nuevo
    // tenga las nueve habilidades a 1 con casi todo a cero.
    const nuevo = {
      habilidades: { swordsmanship: { proficiency: { valor: 0 }, balance: { valor: 0 }, power: { valor: 1 } } },
    };
    assert.equal(habilidadDeGuion(nuevo, "skill.swordsmanship"), "1");
  });

  test("`.ratio` divide por el tope que toca, y son dos topes distintos", () => {
    // Una propiedad contra 100 y la habilidad contra 300.
    assert.equal(habilidadDeGuion(conMagia(80), "skill.spellcasting.divination.ratio"), "0.8");
    // (1+1+1+80+1 → media 17) / 300
    assert.equal(habilidadDeGuion(conMagia(80), "skill.spellcasting.ratio"), String(17 / 300));
  });

  test("`.max` contesta el tope, y ANTES de mirar si la habilidad existe", () => {
    // `if (Prop.contains(".max")) RETURN_INT(Max)` va delante del
    // `GetSkillStatByName`, así que una habilidad inventada también contesta.
    assert.equal(habilidadDeGuion(conMagia(60), "skill.swordsmanship.max"), "300");
    assert.equal(habilidadDeGuion(conMagia(60), "skill.no_existe.max"), "300");
    // Con subhabilidad el tope es el de propiedad.
    assert.equal(habilidadDeGuion(conMagia(60), "skill.swordsmanship.power.max"), "100");
  });

  test("una propiedad que esa habilidad NO tiene da 0, no un error", () => {
    // `parry` tiene UNA propiedad. `skill.parry.power` pide la tercera, y el
    // motor devuelve 0 por rango (msmonstershared.cpp:480). Su primera sí sale.
    assert.equal(habilidadDeGuion(conMagia(60), "skill.parry.prof"), "7");
    assert.equal(habilidadDeGuion(conMagia(60), "skill.parry.power"), "0");
  });

  test("una habilidad que no existe da 0", () => {
    // El motor sólo avisa por consola: «Player skill %s doesn't exist!».
    assert.equal(habilidadDeGuion(conMagia(60), "skill.brujeria.power"), "0");
  });

  test("lo que no empieza por `skill.` no es de aquí", () => {
    assert.equal(habilidadDeGuion(conMagia(60), "hp"), "0");
    assert.equal(habilidadDeGuion(conMagia(60), ""), "0");
    assert.equal(habilidadDeGuion(null, "skill.swordsmanship.power"), "0");
    assert.equal(habilidadDeGuion({}, "skill.swordsmanship.power"), "0");
  });

  test("se trunca, no se redondea: `RETURN_INT`", () => {
    const p = { habilidades: { parry: { proficiency: { valor: 37.8 } } } };
    assert.equal(habilidadDeGuion(p, "skill.parry.prof"), "37");
  });

  test("el ORDEN de las subhabilidades es el del motor, y los índices se solapan", () => {
    // `.prof` y `.fire` son los dos el 0, y no es un fallo: el índice es la
    // posición dentro de las propiedades de ESA habilidad. Si el orden cambiara,
    // una escuela podría casar con `.power` antes que con la suya.
    assert.deepEqual(SUBHABILIDADES.map(([a]) => a),
      [".prof", ".balance", ".power", ".fire", ".ice", ".lightning", ".divination", ".affliction"]);
    assert.deepEqual(SUBHABILIDADES.map(([, i]) => i), [0, 1, 2, 0, 1, 2, 3, 4]);
  });
});
