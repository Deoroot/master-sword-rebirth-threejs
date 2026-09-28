// EL GOLPE DEL JUGADOR, comprobado sin navegador.
//
// Cada prueba de aquí corresponde a una forma de que el combate del jugador
// parezca funcionar y esté mal:
//
//   el daño cae en el fotograma del clic          -> se juega como una pistola
//   el arma falla el 30 % de las veces            -> el motor ya no falla nunca
//   el crítico sale el 5 %                        -> son el 4 %
//   la potencia no multiplica                     -> el jugador mata de un golpe
//   aguantar el botón carga                       -> no, hay que pulsar dos veces
//   el mandoble es un rayo                        -> es una esfera

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Brazo, FASE, CONO, GRADOS_DEL_CONO, CRITICO, SUELO_DE_POTENCIA,
  cargaDe, segundosDeCarga, fraccionDePotencia, danoDelGolpe,
  dentroDelCono, elegirObjetivo, expDeLaMuerte,
} from "../src/play/golpe.js";

// La espada oxidada, tal y como la lee `leerFichaObjeto`. Se copia aquí para
// que la prueba no dependa de tener el juego instalado; que estos números sean
// los del script lo comprueba `tools/objetos.mjs`, que lee el fichero.
const ESPADA = {
  id: "swords_rsword",
  multiplicadorDeCarga: 2,
  animaciones: { ataque: [2, 3, 4], parado: 1, sacar: 0, guardar: 5 },
  ataques: [
    {
      tipo: "strike-land", habilidad: "swordsmanship", dano: 90, danoRango: 50,
      alcance: 60, duracion: 1.1, retardo: 0.6, aguante: 0.3, precision: 0.7,
      teclas: ["+attack1"], prioridad: 0, carga: null, pideHabilidad: 0,
    },
    {
      tipo: "strike-land", habilidad: "swordsmanship", dano: 90, danoRango: 50,
      alcance: 60, duracion: 1.1, retardo: 0.6, aguante: 0.3, precision: 0.7,
      teclas: ["-attack1"], prioridad: 1, carga: 1, pideHabilidad: 2,
    },
  ],
};

const avanzar = (b, segundos, estado, paso = 1 / 60) => {
  const eventos = [];
  for (let t = 0; t < segundos - 1e-9; t += paso) {
    eventos.push(b.tic(paso, estado));
  }
  return eventos;
};

// ── los dos relojes ───────────────────────────────────────────────────────

test("el golpe cae en `delay.strike` y no al empezar", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.5 });
  const e = avanzar(b, 1.05, { pulsado: true });
  const cuando = e.findIndex((x) => x.golpe);
  assert.ok(cuando >= 0, "el golpe no cae nunca");
  const segundos = (cuando + 1) / 60;
  assert.ok(Math.abs(segundos - 0.6) < 0.02, `cae a los ${segundos.toFixed(2)} s, no a los 0,60`);
});

test("y cae UNA vez por mandoble, no en cada paso", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.5 });
  // Un solo mandoble: el botón se suelta antes de que acabe, para que no enlace.
  const e = avanzar(b, 1.05, { pulsado: true });
  assert.equal(e.filter((x) => x.golpe).length, 1);
});

test("el mandoble dura `delay.end` y hasta entonces no empieza otro", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  const e = avanzar(b, 1.2, { pulsado: true });
  assert.equal(e.filter((x) => x.acaba).length, 1);
  const fin = e.findIndex((x) => x.acaba);
  assert.ok(Math.abs(fin / 60 - 1.1) < 0.03, `acaba a los ${(fin / 60).toFixed(3)} s`);
  // Y el siguiente no arranca en el mismo paso que acaba el anterior: el motor
  // llama a `StartAttack()` ANTES que a `Attack()`, así que el hueco es de un
  // fotograma. Sin esto la cadencia sale más rápida de lo que el juego permite.
  assert.equal(e[fin].empieza, null);
  assert.ok(e[fin + 1]?.empieza, "el segundo mandoble no arranca al paso siguiente");
});

test("con el botón aguantado se enlazan mandobles", () => {
  // `StartAttack` se intenta cada fotograma, así que al acabar uno empieza el
  // siguiente. Tres segundos dan para dos de 1,1 s y parte del tercero.
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  const e = avanzar(b, 3.0, { pulsado: true });
  assert.equal(e.filter((x) => x.empieza).length, 3);
});

test("y sin pulsar no pasa nada", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.5 });
  const e = avanzar(b, 2, { pulsado: false });
  assert.equal(e.filter((x) => x.empieza).length, 0);
  assert.equal(e.filter((x) => x.golpe).length, 0);
  assert.equal(b.fase, FASE.QUIETO);
});

test("atacar es lo que corta el trote", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.5 });
  assert.equal(b.atacando, false);
  b.tic(1 / 60, { pulsado: true });
  assert.equal(b.atacando, true);
});

// ── la carga, y su regla del segundo clic ────────────────────────────────

test("aguantar el botón desde el principio NO carga", () => {
  // Es la trampa: al primer clic no hay ataque en curso, así que el reloj de
  // carga no arranca. Aguantar sólo enlaza mandobles normales.
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  avanzar(b, 1.0, { pulsado: true });
  assert.equal(b.carga, 0);
});

test("el segundo clic durante el mandoble carga, y mientras carga NO se blande", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  // clic, se suelta, y se vuelve a pulsar mientras el mandoble sigue
  b.tic(1 / 60, { pulsado: true });
  b.tic(1 / 60, { pulsado: false });
  const e = avanzar(b, 1.2, { pulsado: true, destreza: 2 });
  assert.ok(b.carga >= 1, `carga ${b.carga.toFixed(2)}`);
  // Y ni un mandoble más en ese tiempo: mientras cargas, el ataque normal está
  // descartado («Don't do 'uncharged' while charging»), así que el brazo espera
  // quieto con la carga en la mano. Sin esa regla, aguantar daría mandobles y
  // la carga no llegaría nunca a 1.
  assert.equal(e.filter((x) => x.empieza).length, 0);
  assert.equal(b.fase, FASE.QUIETO);
});

test("y al soltar con el brazo libre sale el cargado", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  b.tic(1 / 60, { pulsado: true });
  b.tic(1 / 60, { pulsado: false });
  avanzar(b, 1.2, { pulsado: true, destreza: 2 });
  const soltar = b.tic(1 / 60, { pulsado: false, destreza: 2 });
  assert.ok(soltar.empieza, "el cargado no empieza al soltar");
  assert.equal(soltar.empieza.carga, 1);
  assert.deepEqual(soltar.empieza.teclas, ["-attack1"]);
});

test("pero soltando A MEDIO mandoble la carga se pierde", () => {
  // Es la regla dura, y es del motor: `ActivateButtonUp` se ejecuta con el
  // botón arriba TODOS los fotogramas, no sólo al soltarlo, y recalcula la
  // carga guardada desde un reloj que ya está a cero. O sea que la carga vive
  // **un fotograma**: si el brazo está ocupado justo en ése, se tira.
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  b.tic(1 / 60, { pulsado: true });
  b.tic(1 / 60, { pulsado: false });
  avanzar(b, 1.0, { pulsado: true, destreza: 2 });   // el mandoble aún corre
  assert.equal(b.fase, FASE.BLANDIENDO);
  const soltar = b.tic(1 / 60, { pulsado: false, destreza: 2 });
  assert.equal(soltar.empieza, null);
  const e = avanzar(b, 0.5, { pulsado: false, destreza: 2 });
  assert.equal(e.filter((x) => x.empieza).length, 0, "no debería salir nada");
  assert.equal(b.cargaHecha, 0);
});

test("una carga guardada con el botón pulsado BLOQUEA el brazo, y soltar lo cura", () => {
  // Esto es el fallo que medí en el mapa —120 segundos aguantando el botón y
  // cero mandobles, sin un solo error— y resulta que **el motor hace lo mismo**:
  // con una carga guardada, el ataque normal está descartado por estar cargando
  // y el cargado por las teclas, así que aguantando no sale nada. Lo que salva
  // al jugador es que suelte, porque `ActivateButtonUp` recalcula la carga
  // guardada a cero.
  //
  // Se deja tal cual y se prueba, en vez de «arreglarlo»: si un día se juega
  // raro, esta prueba dice que es del motor y dónde está escrito.
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  b.cargaHecha = 1.3;                       // carga guardada, sin destreza para usarla
  const bloqueado = avanzar(b, 2, { pulsado: true, destreza: 0 });
  assert.equal(bloqueado.filter((x) => x.empieza).length, 0);
  // Soltar un fotograma la tira, y a partir de ahí se vuelve a blandir.
  b.tic(1 / 60, { pulsado: false, destreza: 0 });
  assert.equal(b.cargaHecha, 0);
  const e = avanzar(b, 2, { pulsado: true, destreza: 0 });
  assert.ok(e.filter((x) => x.empieza).length >= 1, "no se recupera al soltar");
});

test("sin la destreza que pide, el cargado no se elige", () => {
  const b = new Brazo(ESPADA, { azar: () => 0.9 });
  b.tic(1 / 60, { pulsado: true, destreza: 1 });
  b.tic(1 / 60, { pulsado: false, destreza: 1 });
  avanzar(b, 1.1, { pulsado: true, destreza: 1 });
  const e = avanzar(b, 0.5, { pulsado: false, destreza: 1 });
  assert.equal(e.filter((x) => x.empieza).length, 0);
});

test("la curva de carga es la del motor: 100 % a 1 s, 200 % a 1,67", () => {
  assert.equal(cargaDe(0.5), 0.5);
  assert.equal(cargaDe(1), 1);
  assert.ok(Math.abs(cargaDe(5 / 3) - 2) < 1e-9);
  assert.ok(Math.abs(segundosDeCarga(2) - 5 / 3) < 1e-9);
});

test("el cargado dobla el daño base pero no el rango", () => {
  const cargado = { dano: 90, danoRango: 50 };
  // Con el dado al máximo: (90×2) + 50 = 230, no (90+50)×2 = 280.
  const { dano } = danoDelGolpe(cargado, {
    potencia: 100, azar: () => 0.999999, multiplicadorDeCarga: 2,
  });
  assert.ok(Math.abs(dano / 1.5 - 230) < 1e-6 || Math.abs(dano - 230) < 1e-6,
    `dano ${dano}`);
});

// ── el daño ──────────────────────────────────────────────────────────────

test("la potencia multiplica, y un personaje nuevo hace el 1 %", () => {
  // Un punto de potencia es lo que da `CreateChar`. Espada de 90: 0,9.
  const { dano } = danoDelGolpe(ESPADA.ataques[0], { potencia: 1, azar: () => 0 });
  assert.ok(Math.abs(dano - 0.9) < 1e-9, `${dano}`);
  const lleno = danoDelGolpe(ESPADA.ataques[0], { potencia: 100, azar: () => 0 });
  assert.equal(lleno.dano, 90);
});

test("y sin potencia queda el suelo de 0,001, no un cero", () => {
  assert.equal(fraccionDePotencia(0), SUELO_DE_POTENCIA);
  const { dano } = danoDelGolpe(ESPADA.ataques[0], { potencia: 0, azar: () => 0 });
  assert.ok(dano > 0 && dano < 0.1);
});

test("el dado del rango de daño es de ENTEROS", () => {
  const vistos = new Set();
  for (let i = 0; i < 400; i++) {
    const { dano } = danoDelGolpe(ESPADA.ataques[0], { potencia: 100, azar: Math.random });
    vistos.add(dano / 1.5 === Math.round(dano / 1.5) ? dano / 1.5 : dano);
  }
  for (const v of vistos) assert.equal(v, Math.round(v), `${v} no es entero`);
});

test("el crítico es el 4 % y multiplica por 1,5", () => {
  // Con la tirada a 96, 97, 98 y 99 entra; con 95 no, porque el motor compara
  // con `>` y no con `>=`.
  const a = { dano: 100, danoRango: 0 };
  const con = (tirada) => danoDelGolpe(a, { potencia: 100, azar: () => tirada / 100 });
  assert.equal(con(95).critico, false);
  assert.equal(con(96).critico, true);
  assert.equal(con(96).dano, 100 * CRITICO.multiplicador);
  let criticos = 0;
  const n = 200000;
  for (let i = 0; i < n; i++) if (danoDelGolpe(a, { potencia: 100 }).critico) criticos++;
  const pct = (criticos / n) * 100;
  assert.ok(Math.abs(pct - 4) < 0.3, `${pct.toFixed(2)} % de críticos, no 4 %`);
});

test("sin nivel para el arma, la mitad de daño", () => {
  const a = { dano: 100, danoRango: 0 };
  const { dano } = danoDelGolpe(a, { potencia: 100, azar: () => 0, sinNivel: true });
  assert.equal(dano, 50);
});

// ── a quién le da ────────────────────────────────────────────────────────

const enPunto = (x, y, z) => ({ id: `${x},${z}`, centro: [x, y, z], vivo: true });

test("le da al más cercano dentro del alcance, y a UNO solo", () => {
  const r = elegirObjetivo({
    desde: [0, 0, 0], mirando: [1, 0, 0], alcance: 60,
    candidatos: [enPunto(50, 0, 0), enPunto(20, 0, 0), enPunto(40, 0, 0)],
  });
  assert.equal(r.objetivo.centro[0], 20);
});

test("y no le da a nada más allá del alcance", () => {
  const r = elegirObjetivo({
    desde: [0, 0, 0], mirando: [1, 0, 0], alcance: 60,
    candidatos: [enPunto(61, 0, 0)],
  });
  assert.equal(r, null);
});

test("es una ESFERA: le da a lo que tiene al lado, no sólo en la cruceta", () => {
  // A 30 unidades a la derecha y 20 delante: el rayo de la cruceta no le daría
  // y la esfera sí, porque está a 36 de un alcance de 60 y dentro del cono.
  const r = elegirObjetivo({
    desde: [0, 0, 0], mirando: [0, 0, -1], alcance: 60,
    candidatos: [{ id: "al lado", centro: [20, 0, -30], vivo: true }],
  });
  assert.ok(r, "no le da a un bicho a 36 unidades y 34 grados");
});

test("el cono es de 45 grados y NO tiene techo", () => {
  assert.ok(Math.abs(GRADOS_DEL_CONO - 45.57) < 0.01);
  const mirando = [0, 0, -1];
  // 40 grados: entra. 50: no.
  const rad = (g) => (g * Math.PI) / 180;
  const punto = (g, alto) => [Math.sin(rad(g)) * 50, alto, -Math.cos(rad(g)) * 50];
  assert.equal(dentroDelCono([0, 0, 0], mirando, punto(40, 0)), true);
  assert.equal(dentroDelCono([0, 0, 0], mirando, punto(50, 0)), false);
  // Y con el bicho 200 unidades por encima, sigue entrando: el producto es 2D.
  assert.equal(dentroDelCono([0, 0, 0], mirando, punto(40, 200)), true);
});

test("una pared en medio lo tapa, y la traza IGNORA a los monstruos", () => {
  const candidatos = [enPunto(0, 0, -20), enPunto(0, 0, -40)];
  // `libre` sólo dice «no» para el segundo: si la traza contara monstruos, el
  // primero taparía al segundo y el motor no funciona así.
  const r = elegirObjetivo({
    desde: [0, 0, 0], mirando: [0, 0, -1], alcance: 60, candidatos,
    libre: (_, hasta) => hasta[2] !== -40,
  });
  assert.equal(r.objetivo.centro[2], -20);
  const solo = elegirObjetivo({
    desde: [0, 0, 0], mirando: [0, 0, -1], alcance: 60,
    candidatos: [enPunto(0, 0, -40)],
    libre: () => false,
  });
  assert.equal(solo, null);
});

test("a un muerto no se le pega", () => {
  const r = elegirObjetivo({
    desde: [0, 0, 0], mirando: [0, 0, -1], alcance: 60,
    candidatos: [{ id: "fiambre", centro: [0, 0, -20], vivo: false }],
  });
  assert.equal(r, null);
});

// ── la experiencia ───────────────────────────────────────────────────────

test("matándolo tú solo, la experiencia es la del bicho", () => {
  const xp = expDeLaMuerte({ nivel: 12, vidaMaxima: 100, porCubo: { "swordsmanship.power": 100 } });
  assert.equal(xp["swordsmanship.power"], 12);
});

test("pasarse de daño no da más experiencia", () => {
  const xp = expDeLaMuerte({ nivel: 12, vidaMaxima: 100, porCubo: { "swordsmanship.power": 1000 } });
  assert.equal(xp["swordsmanship.power"], 12);
});

test("repartir el daño entre las tres propiedades PIERDE experiencia", () => {
  // El redondeo es por cubo: tres cubos de 4 exactos dan 12, pero tres de
  // 3,33 dan 3+3+3 = 9. Es el motor, no nosotros.
  const xp = expDeLaMuerte({
    nivel: 10, vidaMaxima: 99,
    porCubo: { "a.proficiency": 33, "a.balance": 33, "a.power": 33 },
  });
  const suma = Object.values(xp).reduce((a, b) => a + b, 0);
  assert.ok(suma < 10, `${suma} deberia ser menos de 10`);
});

test("sin daño no hay experiencia", () => {
  assert.deepEqual(expDeLaMuerte({ nivel: 10, vidaMaxima: 100, porCubo: {} }), {});
});
