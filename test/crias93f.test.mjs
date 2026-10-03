// EL 93, PIEZA F: CUÁNDO TE VE UN BICHO OCIOSO, y por qué una ventana de dos
// segundos en `sondas/consecuencias.mjs` era un dado.
//
// La sonda ponía al jugador a 2 m de cada cría de araña de Gate City y le daba
// DOS segundos para fijarlo. Una cría sin objetivo sólo mira alrededor cuando
// le toca pensar (`Cazador.tic`, el ciclo ocioso de `src/play/ia.js`), así que
// lo que tarda es lo que le quede de ciclo cuando aparece el jugador, y eso
// depende del reloj de pared de la sonda. Estas pruebas fijan las dos cosas
// que lo hacían caer: la espera es el RESTO del ciclo (pendiente −1), y con el
// ciclo entero por delante dos segundos en pasos de 1/60 NO bastan —hace falta
// el paso 121, porque 2,0 − 120·(1/60) queda por encima de cero en coma
// flotante—. Ver doc/CONSECUENCIAS_92.md, sección del 93.
//
// Y lo que dice el motor, que es por qué la sonda espera ahora hasta 3 s: la
// cría es de la IA VIEJA y allí el ciclo ocioso es `CYCLE_TIME_IDLE 2.8`
// (base_npc_attack.script:7, :62-63); el 2,0 de este puerto es el de la nueva
// (base_npc_attack_new.script:95). No se ha cambiado aquí: queda dicho en el
// documento como pendiente.
//
// CORRECCIÓN DEL 94: ya está cambiado. La ficha horneada trae `cicloOcioso`
// (2,8 para la cría) y `Cazador.ciclo` lo lee (test/ciclo94.test.mjs,
// doc/CICLO_94.md). Estas pruebas construyen el cazador con una ficha escrita a
// mano SIN ese campo, así que miden el valor por omisión, `CICLO.ocioso` = 2,0:
// la aritmética del resto del ciclo sigue siendo la misma con cualquier reloj.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { Cazador, CICLO, RELACION } from "../src/play/ia.js";

const DT = 1 / 60;   // el paso fijo del juego, src/main.js:161
const jugadorA2m = { id: "jugador", donde: [79, 0, 0], esJugador: true, relacion: RELACION.ODIO };
const ficha = { pasea: false, alcanceParaPararse: 30, alcanceDeImpacto: 80, alcanceDeGolpe: 50, ancho: 16 };

/** Un cazador que acaba de pensar sin ver a nadie: su reloj vale el ciclo ocioso entero. */
function recienPensado() {
  const c = new Cazador(ficha);
  const r = c.tic(DT, { donde: [0, 0, 0], candidatos: [] });
  assert.ok(r, "el primer tic piensa (reloj a 0 al nacer)");
  assert.equal(c.objetivo, null);
  assert.equal(c.reloj, CICLO.ocioso);
  return c;
}

/** Pasos de 1/60 hasta que fija al jugador, con tope. */
function pasosHastaVerte(c, tope = 400) {
  for (let k = 1; k <= tope; k++) {
    c.tic(DT, { donde: [0, 0, 0], candidatos: [jugadorA2m] });
    if (c.objetivo === "jugador") return k;
  }
  return null;
}

describe("el 93 (F): un bicho ocioso te ve cuando le toca pensar", () => {
  test("con el ciclo entero por delante, 120 pasos de 1/60 (2,0 s) NO bastan: hace falta el 121", () => {
    const c = recienPensado();
    // El borde del 81: la cuenta flotante deja el reloj por encima de cero.
    let r = CICLO.ocioso;
    for (let k = 0; k < 120; k++) r -= DT;
    assert.ok(r > 0, `2,0 − 120·(1/60) = ${r}`);
    assert.equal(pasosHastaVerte(c), 121);
  });

  test("la espera es el RESTO del ciclo: adelantar la fase la acorta lo mismo", () => {
    const esperas = [0, 30, 60, 90].map((adelanto) => {
      const c = recienPensado();
      for (let k = 0; k < adelanto; k++) c.tic(DT, { donde: [0, 0, 0], candidatos: [] });
      return pasosHastaVerte(c);
    });
    // Pendiente −1: cada paso adelantado es un paso menos de espera.
    assert.deepEqual(esperas, [121, 91, 61, 31]);
  });

  test("y con un objetivo ya puesto no hay espera: piensa en combate cada 0,1 s", () => {
    const c = recienPensado();
    c.apuntarA("jugador");
    assert.equal(c.reloj, 0, "apuntarA piensa ya");
    assert.equal(c.ciclo, CICLO.combate);
  });

  test("el tope de la sonda cubre el ciclo ocioso del motor para la IA vieja (2,8 s)", async () => {
    const { readFileSync } = await import("node:fs");
    const sonda = readFileSync(new URL("../sondas/consecuencias.mjs", import.meta.url), "utf8");
    const m = sonda.match(/const TOPE_PARA_VERTE = ([\d.]+);/);
    assert.ok(m, "la sonda declara su tope");
    const CYCLE_TIME_IDLE_VIEJO = 2.8;   // base_npc_attack.script:7, escrito a mano (el 75)
    assert.ok(Number(m[1]) > CYCLE_TIME_IDLE_VIEJO, `tope ${m[1]} s`);
    assert.ok(Number(m[1]) > CICLO.ocioso, "y el del puerto");
  });
});
