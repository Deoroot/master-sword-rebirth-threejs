// LAS DOS REGLAS DE PARRY, y que son dos.
import test from "node:test";
import assert from "node:assert/strict";
import {
  TOPE_DE_PARRY, TOPE_DE_TIRADA_DEL_MOTOR, TOPE_DE_TIRADA_DEL_SCRIPT,
  aciertoDelGolpe, parryDelBicho, parryDelJugador,
  valorDeParryDelJugador, probabilidadDeParry,
} from "../src/play/parry.js";

// ── El acierto del golpe, que es el suelo de la tirada del que se defiende ───

test("el acierto del golpe es 100 menos el dado, o sea de 1 a 100", () => {
  assert.equal(aciertoDelGolpe({ tirada: 0 }), 100);
  assert.equal(aciertoDelGolpe({ tirada: 99 }), 1);
});

test("un golpe bien tirado es más difícil de parar: sube el suelo de la tirada", () => {
  // Con acierto 100, `rand(100,100)` sólo puede dar 100, y la tirada de parry
  // tope a 90 no llega nunca.
  const r = parryDelBicho({ parry: 100, acierto: 100, tipo: "slash", tiradas: { acierto: 100, parry: 100 } });
  assert.equal(r.tirada, TOPE_DE_TIRADA_DEL_SCRIPT);
  assert.equal(r.para, false);
});

// ── El del bicho: MONSTER_PARRY, tope 90 ────────────────────────────────────

test("sin parry no se para nada", () => {
  assert.equal(parryDelBicho({ parry: 0, acierto: 1 }).para, false);
});

test("el tope de 90 se aplica DESPUES de tirar, así que un parry enorme casi siempre da 90", () => {
  // `$rand(1,500)` capado a 90: la tirada vale 90 el 82 % de las veces. No es
  // lo mismo que tirar `rand(1,90)`, y el motor hace lo primero.
  const r = parryDelBicho({ parry: 500, acierto: 1, tipo: "slash", tiradas: { acierto: 50, parry: 300 } });
  assert.equal(r.tirada, 90);
  assert.equal(r.para, true);
});

test("el bicho no para 'target' ni 'magic', y su lista es de dos y no de ocho", () => {
  assert.equal(parryDelBicho({ parry: 50, tipo: "magic", tiradas: { acierto: 1, parry: 50 } }).para, false);
  assert.equal(parryDelBicho({ parry: 50, tipo: "target", tiradas: { acierto: 1, parry: 50 } }).para, false);
  // El fuego SI lo para, y el motor no: la lista del script es más corta.
  assert.equal(parryDelBicho({ parry: 50, tipo: "fire", tiradas: { acierto: 1, parry: 50 } }).para, true);
  assert.equal(parryDelJugador({ parry: 60, tipo: "fire", tiradas: { acierto: 1, parry: 60 } }).para, false);
});

test("un tipo de daño VACIO cumple la lista del script: la comparación es de subcadena", () => {
  // `if (NPC_CANT_PARRY_TYPES contains PARAM3)` con PARAM3 vacío es cierto, así
  // que un ataque sin `dmg.type` es imparable — por accidente.
  assert.equal(parryDelBicho({ parry: 50, tipo: "", tiradas: { acierto: 1, parry: 50 } }).para, false);
});

test("la araña de Gate City para uno de cada veinte golpes, no uno de cada dos", () => {
  // `spider.script:58` pone `setstat parry 50 0 0`. Eso NO le da la
  // estadística: le da el scriptvar `MONSTER_PARRY`, que es el que lee la regla
  // del script. Y 50 de 100 NO es media parada: la tirada del atacante es
  // `rand(acierto,100)`, que tira alto —su media son 75—, así que un parry de 50
  // para el 4,8 %. La cifra sale de sumar los tres dados y cuadra con tres
  // millones de tiradas: 4,82 %.
  const p = probabilidadDeParry("bicho", { parry: 50 });
  assert.ok(p > 0.047 && p < 0.049, `${(p * 100).toFixed(2)} %`);
});

test("el techo del parry son cuatro de cada nueve golpes, y no se puede pasar", () => {
  // Con la tirada pegada al tope de 80, parar es `80 > rand(acierto,100)`.
  // Medido: 46,6 %. O sea que ni un personaje perfecto para más de la mitad.
  const techo = probabilidadDeParry("motor", { parry: 60, consciencia: 80 });
  assert.ok(techo > 0.46 && techo < 0.47, `${(techo * 100).toFixed(1)} %`);
});

// ── El del jugador: la estadística, tope 60, tirada tope 80 ──────────────────

test("el valor se capa a 60 antes de tirar", () => {
  const r = parryDelJugador({ parry: 999, tiradas: { acierto: 1, parry: 0 } });
  assert.equal(r.valor, TOPE_DE_PARRY);
});

test("la tirada se capa a 80: siempre queda un 20 % de recibir", () => {
  const r = parryDelJugador({ parry: 60, consciencia: 500, tiradas: { acierto: 100, parry: 60 } });
  assert.equal(r.tirada, TOPE_DE_TIRADA_DEL_MOTOR);
  assert.equal(r.para, false, "con acierto 100 no hay parry posible");
});

test("la consciencia suma a la tirada", () => {
  const sin = parryDelJugador({ parry: 10, consciencia: 0, tiradas: { acierto: 15, parry: 10 } });
  const con = parryDelJugador({ parry: 10, consciencia: 20, tiradas: { acierto: 15, parry: 10 } });
  assert.equal(sin.para, false);
  assert.equal(con.para, true);
});

test("un golpe de 0 de daño no se para", () => {
  const r = parryDelJugador({ parry: 60, dano: 0, tiradas: { acierto: 1, parry: 60 } });
  assert.equal(r.para, false);
  assert.equal(r.porque, "daño 0");
});

test("los ocho tipos del motor ponen la tirada a cero", () => {
  for (const t of ["target", "fire", "poison", "lightning", "cold", "magic", "poison_effect"]) {
    const r = parryDelJugador({ parry: 60, tipo: t, tiradas: { acierto: 1, parry: 60 } });
    assert.equal(r.para, false, t);
    assert.equal(r.tirada, 0, t);
  }
  // Y los que sí se paran, que son los de las armas.
  for (const t of ["slash", "blunt", "pierce"]) {
    assert.equal(parryDelJugador({ parry: 60, tipo: t, tiradas: { acierto: 1, parry: 60 } }).para, true, t);
  }
});

// ── Cuánto parry tiene el jugador ───────────────────────────────────────────

test("el parry del jugador es la competencia del arma que lleva", () => {
  assert.equal(valorDeParryDelJugador({ manos: [{ competencia: 40, habilidad: "swordsmanship" }] }), 40);
});

test("a dos manos vale una vez y media, salvo marciales", () => {
  assert.equal(valorDeParryDelJugador({ manos: [{ competencia: 40, dosManos: true, habilidad: "swordsmanship" }] }), 60);
  assert.equal(valorDeParryDelJugador({ manos: [{ competencia: 40, dosManos: true, habilidad: "martialarts" }] }), 40);
});

test("el puño desnudo no para y el escudo no aporta: multiplica", () => {
  assert.equal(valorDeParryDelJugador({ manos: [{ punoDesnudo: true, competencia: 40 }] }), 0);
  const conEscudo = valorDeParryDelJugador({
    manos: [{ competencia: 40, habilidad: "swordsmanship" }, { escudo: true, multiplicadorDeParry: 1.3 }],
  });
  // 51 y no 52, y no es un error de redondeo mío: el script suma 1,3 a un
  // multiplicador que vale 1,0 y luego le resta 1,0, y ese viaje de ida y vuelta
  // deja 1,2999999 en coma flotante. 40 × eso es 51,99999, y `$int` trunca.
  assert.equal(conEscudo, 51, "40 × (1,0 + 1,3 − 1,0)");
});

test("escudo y puño desnudo usan la competencia de marciales", () => {
  const v = valorDeParryDelJugador({
    manos: [{ punoDesnudo: true, marciales: 20 }, { escudo: true, multiplicadorDeParry: 1.3 }],
  });
  assert.equal(v, 25, "20 × 1,2999999");
});

test("UN PERSONAJE NUEVO NO PARA NADA, y por la misma razón que hace el 1 % del daño", () => {
  // `CreateChar` reparte un punto a la POTENCIA de cada habilidad de arma
  // (sv_character.cpp:50), no a la competencia. Y el parry ES la competencia.
  const parry = valorDeParryDelJugador({ manos: [{ competencia: 0, habilidad: "swordsmanship" }] });
  assert.equal(parry, 0);
  assert.equal(probabilidadDeParry("motor", { parry, consciencia: 0 }), 0);
});

test("la consciencia de un personaje nuevo también es cero, y eso cierra la puerta", () => {
  // `NATURAL_AWR` se calcula con las COMPETENCIAS de siete habilidades
  // (msmonstershared.cpp:541-548), todas a 0 en un personaje nuevo. Sin
  // consciencia la tirada mínima es `rand(0,0)` = 0, que no gana a nada.
  const r = parryDelJugador({ parry: 0, consciencia: 0, tiradas: { acierto: 1, parry: 0 } });
  assert.equal(r.para, false);
});
