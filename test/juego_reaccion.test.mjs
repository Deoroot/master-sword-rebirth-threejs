// LAS CONSECUENCIAS DEL GOLPE: huir, encogerse, avisar, cambiar de objetivo.
import test from "node:test";
import assert from "node:assert/strict";
import {
  AVISO, alcanceDeAviso, aQuienAvisa, huyeDelGolpe,
  seEncogeIA, seEncogeStruck, cambiaDeObjetivo,
  ENCOGERSE_DEPRECIADO, STRUCK_POR_OMISION, reaccionAlGolpe,
} from "../src/play/reaccion.js";
import { parryDelBicho } from "../src/play/parry.js";

// ── El alcance del aviso, que sale de la vida ────────────────────────────────

test("el alcance del aviso va de 256 a 1024 unidades según la vida máxima", () => {
  assert.equal(alcanceDeAviso(0), AVISO.minimo);
  assert.equal(alcanceDeAviso(1000), AVISO.maximo);
  // Y pasado el millar no crece: `if > 1000 → 1000`.
  assert.equal(alcanceDeAviso(50000), AVISO.maximo);
});

test("el goblin de 50 de vida avisa a 294 unidades, que son siete metros y medio", () => {
  const r = alcanceDeAviso(50);
  assert.ok(Math.abs(r - 294.4) < 0.1, String(r));
  assert.ok(Math.abs(r / 39.37 - 7.48) < 0.05, "en metros");
});

test("el aviso es una esfera de ALIADOS y atraviesa paredes", () => {
  const de = { i: 0, donde: [0, 0, 0] };
  const candidatos = [
    { i: 1, donde: [200, 0, 0], aliado: true },
    { i: 2, donde: [200, 0, 0], aliado: false },   // enemigo: no se le avisa
    { i: 3, donde: [900, 0, 0], aliado: true },    // fuera del radio
    { i: 4, donde: [0, 290, 0], aliado: true },    // y la esfera es en 3D
  ];
  const fuera = aQuienAvisa({
    de, vidaMaxima: 50, candidatos, esAliado: (_a, b) => b.aliado,
  });
  assert.deepEqual(fuera, [1, 4]);
});

// ── Huir ────────────────────────────────────────────────────────────────────

const RATA = { huir: { puede: true, nunca: false, vida: 2, probabilidad: 30, distancia: 1000, tiempo: 10 } };
const GOBLIN = { huir: { puede: false, nunca: false, vida: 0, probabilidad: 0, distancia: 1000, tiempo: 10 } };

test("por omisión no huye nadie: CAN_FLEE viene a 1 pero FLEE_HEALTH a 0", () => {
  const porOmision = { huir: { puede: true, nunca: false, vida: 0, probabilidad: 0, distancia: 1000, tiempo: 10 } };
  assert.equal(huyeDelGolpe({ ficha: porOmision, vida: 1, tirada: 1 }).huye, false);
});

test("la rata gigante huye con 1 de vida y no con 2: la comparación es estricta", () => {
  assert.equal(huyeDelGolpe({ ficha: RATA, vida: 1, tirada: 1 }).huye, true);
  assert.equal(huyeDelGolpe({ ficha: RATA, vida: 2, tirada: 1 }).huye, false);
});

test("y sólo el 30 % de las veces", () => {
  assert.equal(huyeDelGolpe({ ficha: RATA, vida: 1, tirada: 30 }).huye, true);
  assert.equal(huyeDelGolpe({ ficha: RATA, vida: 1, tirada: 31 }).huye, false);
});

test("el goblin tiene CAN_FLEE 0 a mano: no huye ni con un punto de vida", () => {
  assert.equal(huyeDelGolpe({ ficha: GOBLIN, vida: 1, tirada: 1 }).huye, false);
});

test("el que ya huye no vuelve a arrancar la huida", () => {
  assert.equal(huyeDelGolpe({ ficha: RATA, vida: 1, huyendo: true, tirada: 1 }).huye, false);
});

// ── Encogerse: el de la IA ──────────────────────────────────────────────────

const CON_FLINCH = {
  vida: 50,
  encogerse: { puede: true, animacion: "flinch", probabilidad: 100, umbralDeDano: 5, vidaParaEmpezar: 50, espera: 5 },
};

test("CAN_FLINCH viene a 0, así que el sistema de la IA está apagado por omisión", () => {
  const apagado = { encogerse: { ...CON_FLINCH.encogerse, puede: false } };
  assert.equal(seEncogeIA({ ficha: apagado, vida: 40, dano: 50 }).encoge, false);
});

test("el umbral es el 10 % de la vida MAXIMA, y la espada oxidada no llega", () => {
  // 1,1 de daño contra un goblin de 50: el umbral son 5. Ni con CAN_FLINCH 1.
  assert.equal(seEncogeIA({ ficha: CON_FLINCH, vida: 49, dano: 1.1 }).encoge, false);
  assert.equal(seEncogeIA({ ficha: CON_FLINCH, vida: 49, dano: 5.1 }).encoge, true);
});

test("la espera de cinco segundos corre aunque el dado salga mal", () => {
  // El `setvard FLINCHED_RECENTLY 1` está detrás del bloque del dado, no dentro:
  // un golpe que pasa el umbral y falla el dado gasta el intento igual.
  const r = seEncogeIA({ ficha: CON_FLINCH, vida: 49, dano: 10, ahora: 100, tirada: 101 });
  assert.equal(r.encoge, false);
  assert.equal(r.hasta, 105);
  assert.equal(seEncogeIA({ ficha: CON_FLINCH, vida: 49, dano: 10, ahora: 104, desde: 105 }).encoge, false);
});

// ── Encogerse: el de base_struck, que es el que corre en Gate City ───────────

const ZOMBI = {
  vida: 100,
  encogerse: { puede: false, animacion: null, probabilidad: 0, umbralDeDano: 10, vidaParaEmpezar: 100, espera: 5 },
  struck: {
    usaEncogerse: true, usaDolor: true, animacion: "anim_xbow_flinch", material: "flesh",
    esperaEntreEncogerse: 30, umbralDeEncogerse: 0.1, tiempoQuieto: 1.5,
  },
};

test("el de base_struck NO tira ningún dado: si pasa el umbral, se encoge", () => {
  const r = seEncogeStruck({ ficha: ZOMBI, vida: 100, dano: 11, ahora: 50 });
  assert.equal(r.encoge, true);
  assert.equal(r.animacion, "anim_xbow_flinch");
});

test("y su umbral es un ratio de la vida ACTUAL: cuanto más herido, más fácil", () => {
  // Con 100 de vida hacen falta más de 10 de daño; con 10 de vida basta 1,1 —
  // que es justo lo que hace un personaje nuevo con la espada oxidada.
  assert.equal(seEncogeStruck({ ficha: ZOMBI, vida: 100, dano: 1.1, ahora: 50 }).encoge, false);
  assert.equal(seEncogeStruck({ ficha: ZOMBI, vida: 10, dano: 1.1, ahora: 50 }).encoge, true);
});

test("una vulnerabilidad del doble se salta el umbral entero", () => {
  const r = seEncogeStruck({
    ficha: ZOMBI, vida: 100, dano: 0.1, tipo: "fire", ahora: 50,
    vulnerabilidad: (t) => (t === "fire" ? 2 : 1),
  });
  assert.equal(r.encoge, true);
  assert.equal(r.porque, "vulnerable");
});

test("se encoge una vez cada treinta segundos y se queda quieto uno y medio", () => {
  const r = seEncogeStruck({ ficha: ZOMBI, vida: 10, dano: 5, ahora: 100 });
  assert.equal(r.hasta, 130);
  assert.equal(r.quietoHasta, 101.5);
  assert.equal(seEncogeStruck({ ficha: ZOMBI, vida: 10, dano: 5, ahora: 129, desde: 130 }).encoge, false);
});

test("mientras la IA está suspendida no se encoge otra vez", () => {
  assert.equal(seEncogeStruck({ ficha: ZOMBI, vida: 10, dano: 5, ahora: 100, quieto: true }).encoge, false);
});

// ── Las tres reglas que NO SE PUEDEN DISPARAR ───────────────────────────────

test("MUERTA 1: cambiar de objetivo es imposible, las dos ramas del plazo están al revés", () => {
  // `if (game.time < NPC_NEXT_RETALITATE)` sigue adelante y `else` se va, y la
  // variable sólo se escribe en la rama que nunca se toma: se queda en 0.
  const ficha = { puedeCambiarDeObjetivo: true, esperaDeCambio: { min: 5, max: 10 } };
  for (const ahora of [0.1, 5, 100, 10000]) {
    assert.equal(cambiaDeObjetivo({ ficha, ahora, proximo: 0 }).cambia, false, `t=${ahora}`);
  }
});

test("...así que el RETALIATE_CHANCE 75% que escriben el goblin y la araña es dato muerto", () => {
  const ficha = { puedeCambiarDeObjetivo: true, cambioDeObjetivo: 75, esperaDeCambio: { min: 5, max: 10 } };
  assert.match(cambiaDeObjetivo({ ficha, ahora: 3, proximo: 0 }).porque, /al revés/);
});

test("MUERTA 2: el encogerse depreciado tira un dado y elige siempre la última", () => {
  // `local L_RND_FLINCH $rand(0,6)` y luego `$get_token(tokens, L_NFLINCH_ANIMS)`.
  assert.equal(ENCOGERSE_DEPRECIADO.animaciones.length, 7);
  assert.equal(ENCOGERSE_DEPRECIADO.elegida(), "rlflinch");
});

test("MUERTA 3: setstat awareness en un monstruo no hace nada", () => {
  // La consciencia sólo suma en la regla de parry del MOTOR, y un monstruo para
  // con la del script, que no la lee. La araña pone `setstat awareness 20` y esos
  // veinte puntos no aparecen en ninguna cuenta. Se comprueba en el lector:
  // el campo existe, y la regla del bicho no tiene por dónde recibirlo.
  const sin = parryDelBicho({ parry: 50, tipo: "slash", tiradas: { acierto: 60, parry: 50 } });
  assert.equal(sin.tirada, 50, "la tirada del bicho es el dado a secas");
});

// ── El golpe entero ─────────────────────────────────────────────────────────

test("un golpe siempre suena, incluso cuando no pasa nada más", () => {
  const r = reaccionAlGolpe({ ficha: GOBLIN, vida: 49, dano: 1.1, ahora: 10 });
  assert.equal(r.suena, "golpeado");
  assert.equal(r.huye, null);
  assert.equal(r.encoge, null);
});

test("por debajo de media vida el zombi grita, y no más de una vez cada cinco segundos", () => {
  const r = reaccionAlGolpe({ ficha: ZOMBI, vida: 40, dano: 1.1, ahora: 10 });
  assert.equal(r.suena, "dolor");
  assert.equal(r.proximoDolor, 10 + STRUCK_POR_OMISION.esperaEntreDolor.min);
  const luego = reaccionAlGolpe({ ficha: ZOMBI, vida: 40, dano: 1.1, ahora: 12, estado: { proximoDolor: 15 } });
  assert.equal(luego.suena, "golpeado");
});

test("de los dos sistemas de encogerse gana el de base_struck, que corre antes", () => {
  const dos = {
    ...ZOMBI,
    encogerse: { puede: true, animacion: "de-la-ia", probabilidad: 100, umbralDeDano: 1, vidaParaEmpezar: 100, espera: 5 },
  };
  const r = reaccionAlGolpe({ ficha: dos, vida: 10, dano: 5, ahora: 10 });
  assert.equal(r.encoge.animacion, "anim_xbow_flinch");
});
