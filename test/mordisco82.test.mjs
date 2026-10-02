// EL MORDISCO DE VUELTA: por qué una rata no te pegaba nunca.
//
// El 80 puso por primera vez un control delante de una rata y encontró tres
// fallos — pero los tres eran del golpe DEL JUGADOR. Éste es el camino espejo,
// el que va del bicho a ti, y tenía uno propio.
//
// EL FALLO, en una línea: **el motor no compara la distancia, compara `range`**,
// y `range` lleva restada la mitad de las dos anchuras (scriptcmds.cpp:1154,
// con su comentario «MIB JAN2010_20 - range check take model widths into
// account»). Este puerto comparaba la distancia pelada. Para casi todo da
// igual; para una rata es la diferencia entre morder y no morder nunca, y la
// razón es geométrica y no de alcance:
//
//   · el jugador se mide por su CENTRO, 36 unidades sobre sus pies, porque ahí
//     es donde el motor pone su `origin` (caja de 72 centrada)
//   · una rata se mide por sus PIES, porque el `origin` de un monstruo está
//     abajo: `UTIL_SetSize(pev, Vector(…, 0), Vector(…, m_Height))`
//     (msmonsterserver.cpp:244)
//   · las dos cajas son de 32 de lado, así que los centros no se acercan a
//     menos de 32 en horizontal: los cuerpos se estorban
//
// y con eso la distancia 3D no baja de hypot(32, 36) = 48,2 — mientras
// `ATTACK_RANGE` de la rata es **48**. Cuatro décimas de unidad de más, para
// siempre. Restando las anchuras son 32,2 y muerde, que es lo que hace en el
// juego original.
//
// POR QUÉ EL 80 NO LO VIO, que es la parte que conviene no repetir: su arnés
// pone al jugador en `[aU, 0, 0]`, o sea **a la altura de los pies de la rata**.
// Ahí el término vertical vale cero y la distancia 3D es la horizontal, que sí
// entra en 48. Es el 71 calcado —«una prueba sobre una diferencia tiene que
// poner los números en los que la diferencia existe»— y por eso aquí el
// jugador está siempre de pie, a 36.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { leerFichaNpc, modeloYAnimaciones, RELACION, leerRazas, relacionDeRazas, RAZA_DEL_JUGADOR, esEnemigo } from "../src/bsp/script.js";
import { Cazador, ACCION, rangoDeAtaque } from "../src/play/ia.js";
import { Manada } from "../src/play/manada.js";
import { apuntaAlQueTePega } from "../src/play/reaccion.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";

/**
 * LOS NÚMEROS SALEN DEL `.script` DEL MOD, no de aquí.
 *
 * Leerlos con el lector de verdad es lo que impide que esta prueba envejezca
 * sola: si alguien cambia el extractor y la rata pierde su alcance, esto se
 * pone rojo en vez de seguir midiendo una copia a mano.
 */
const RATA = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/giantrat"));

/**
 * LA GEOMETRÍA, escrita a mano y con su cita, porque ES la regla (el 75).
 *
 * Derivarla de las constantes que mide dejaría la prueba verde con la resta
 * puesta del revés.
 */
const CENTRO_DEL_JUGADOR = 36;   // caja de 72, `origin` en el medio
const SEPARACION_MINIMA = 32;    // 16 + 16: media caja de cada uno
const MEDIA_ANCHURA_RATA = 16;   // `m_Width / 2` con `m_Width` 32

describe("los números de la rata son los de su archivo", () => {
  test("alcance, acierto y daño, leídos del guion y no escritos aquí", () => {
    assert.equal(RATA.ancho, 32);
    assert.equal(RATA.alto, 32);
    assert.equal(RATA.ia.alcanceDeGolpe, 48, "`setvard ATTACK_RANGE 48`");
    assert.equal(RATA.ia.alcanceDeImpacto, 100, "`setvard ATTACK_HITRANGE 100`");
    assert.equal(RATA.ia.dano.min, 0.4, "`const ATTACK_DAMAGE 0.4` — los 0,4 son del mod");
    assert.equal(RATA.ia.dano.max, 0.4);
    assert.equal(RATA.ia.aciertos.min, 30, "`const ATTACK_HITCHANCE 30%`");
  });

  test("y la anchura viaja DENTRO de la ficha de combate", () => {
    // Si el extractor dejara de horneármela, `range` perdería la resta y el
    // mordisco se iría otra vez sin que nada más se pusiera rojo.
    assert.equal(RATA.ia.ancho, 32);
    assert.equal(new Cazador(RATA.ia).ancho, 32, "y el cazador la coge sin que nadie se la pase");
  });
});

describe("`range` no es la distancia", () => {
  test("le resta la mitad de las dos anchuras", () => {
    assert.equal(rangoDeAtaque([0, 0, 0], [100, 0, 0], 32, 0), 84);
    assert.equal(rangoDeAtaque([0, 0, 0], [100, 0, 0], 32, 32), 68);
  });

  test("la del jugador es CERO, y eso no es que falte", () => {
    // `m_Width` sólo se asigna en el `width` de un guion de NPC
    // (npcscript.cpp:201) y el del jugador no lo trae. Darle los 32 de su caja
    // regalaría 16 unidades de alcance que el motor no da.
    assert.equal(rangoDeAtaque([0, 0, 0], [100, 0, 0], 32), 84);
  });

  test("no se topa a cero: el motor deja que salga negativo", () => {
    assert.equal(rangoDeAtaque([0, 0, 0], [10, 0, 0], 32, 32), -22);
  });

  test("y la PERSECUCIÓN no lleva la resta: ahí el motor usa `$dist` pelado", () => {
    // Este control nace de una rotura que se quedó VERDE en las 2 091 pruebas:
    // metí la resta también en el alcance de persecución y nadie se enteró. La
    // frontera es real y está citada —el ataque compara `NPC_RANGE_TYPE`
    // (base_npc_attack_new.script:98, `const NPC_RANGE_TYPE range`) y la
    // persecución compara `$dist(MY_ORG,TARG_ORG)` (:258), que es entre dos
    // vectores y no sabe de anchuras—, así que si no la defiende nada, un bicho
    // ancho perseguiría media anchura más lejos que en el motor.
    const LIMITE = 4000;                     // `npcatk_post_load`
    const c = new Cazador(RATA.ia, { alcanceDePersecucion: LIMITE });
    const aver = (aU) => {
      const k = new Cazador(RATA.ia, { alcanceDePersecucion: LIMITE });
      // Primero que lo vea de cerca, para que tenga objetivo que olvidar.
      k.tic(k.reloj + 1e-6, {
        donde: [0, 0, 0],
        candidatos: [{ id: "jugador", donde: [40, CENTRO_DEL_JUGADOR, 0], esJugador: true, relacion: RELACION.ODIO, ancho: 0 }],
        veA: () => true,
      });
      return k.tic(k.reloj + 1e-6, {
        donde: [0, 0, 0],
        candidatos: [{ id: "jugador", donde: [aU, CENTRO_DEL_JUGADOR, 0], esJugador: true, relacion: RELACION.ODIO, ancho: 0 }],
        veA: () => true,
      });
    };
    assert.ok(c instanceof Cazador);
    // A 4008 la distancia pelada se pasa del límite y el `range` de la rata
    // (4008 − 16 = 3992) no: los dos lados del hueco por el que se colaría.
    assert.equal(aver(4008).porQue, "fuera_de_alcance",
      "con `$dist` se olvida, que es lo que hace el motor");
    assert.equal(aver(3990).porQue, undefined, "y justo dentro sigue persiguiendo");
  });

  test("sin anchuras es la distancia pelada, que es lo que usa `$dist(A,B)`", () => {
    // El alcance de PERSECUCIÓN se compara con `$dist(MY_ORG,TARG_ORG)`
    // (base_npc_attack_new.script:258), que es entre dos vectores y no lleva
    // anchuras. Si la resta se hubiera metido ahí, un bicho ancho perseguiría
    // 16 unidades más lejos que en el motor.
    assert.equal(rangoDeAtaque([0, 0, 0], [0, 3, 4]), 5);
  });
});

describe("la cuenta que decide el mordisco", () => {
  /** La rata pegada al jugador: lo más cerca que sus cuerpos la dejan estar. */
  const pegada = () => ({
    rata: [0, 0, 0],
    jugador: [SEPARACION_MINIMA, CENTRO_DEL_JUGADOR, 0],
  });

  test("con la distancia pelada se queda a cuatro décimas, para siempre", () => {
    const { rata, jugador } = pegada();
    const d = Math.hypot(jugador[0] - rata[0], jugador[1] - rata[1], jugador[2] - rata[2]);
    assert.ok(d > RATA.ia.alcanceDeGolpe,
      `la distancia ${d.toFixed(1)} tendría que pasarse de los 48, y da ${d.toFixed(1)}`);
    assert.ok(d - RATA.ia.alcanceDeGolpe < 1,
      "y por poco, que es lo que lo hacía difícil de ver");
  });

  test("y con `range` entra: 32,2 contra 48", () => {
    const { rata, jugador } = pegada();
    const r = rangoDeAtaque(rata, jugador, RATA.ia.ancho, 0);
    assert.ok(r < RATA.ia.alcanceDeGolpe, `range ${r.toFixed(1)} contra 48`);
    assert.equal(Math.round(r * 10) / 10, 32.2);
  });

  test("la resta son 16 unidades, ni 32 ni 8", () => {
    const { rata, jugador } = pegada();
    const d = Math.hypot(jugador[0] - rata[0], jugador[1] - rata[1], jugador[2] - rata[2]);
    assert.equal(Math.round((d - rangoDeAtaque(rata, jugador, RATA.ia.ancho, 0)) * 10) / 10,
      MEDIA_ANCHURA_RATA);
  });

  test("y el cazador decide GOLPEAR ahí", () => {
    const c = new Cazador(RATA.ia);
    const r = c.tic(c.reloj + 1e-6, {
      donde: [0, 0, 0],
      candidatos: [{
        id: "jugador", donde: [SEPARACION_MINIMA, CENTRO_DEL_JUGADOR, 0],
        esJugador: true, relacion: RELACION.ODIO, ancho: 0,
      }],
      veA: () => true,
    });
    assert.equal(r.accion, ACCION.GOLPEAR);
  });

  test("CONTROL NEGATIVO: de verdad lejos sigue sin pegar", () => {
    // Sin esto, «pega» podría ser «pega siempre, desde cualquier sitio», que
    // es un fallo peor que el que se viene a arreglar.
    const c = new Cazador(RATA.ia);
    const r = c.tic(c.reloj + 1e-6, {
      donde: [0, 0, 0],
      candidatos: [{
        id: "jugador", donde: [300, CENTRO_DEL_JUGADOR, 0],
        esJugador: true, relacion: RELACION.ODIO, ancho: 0,
      }],
      veA: () => true,
    });
    assert.equal(r.accion, ACCION.PERSEGUIR);
  });

  test("y a la altura de los PIES entraba ya antes: por eso el 80 no lo vio", () => {
    // Esta prueba no mide una corrección, documenta por qué el fallo sobrevivió
    // a un experimento entero que estaba mirando a este mismo bicho.
    const d = SEPARACION_MINIMA;
    assert.ok(d < RATA.ia.alcanceDeGolpe,
      "con el jugador tumbado a los pies de la rata, 32 < 48 y no hay nada que ver");
  });
});

// ── EL VIAJE ENTERO, por un `Manada` de verdad ──────────────────────────────
//
// Las de arriba miden la REGLA. Ésta mide que alguien la llame: es la lección
// del 59, que ha morderido cuatro veces, y la única forma de verla es entrar
// por donde entra el juego.

const SECUENCIAS_RATA = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0] },
  { indice: 3, nombre: "attack", fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0] },
  { indice: 4, nombre: "die", fps: 30, fotogramas: 40, bucle: false, actividad: 36, pesoActividad: 1, avance: [0, 0, 0] },
];

/** Un dado fijo, para que dos pasadas den lo mismo. */
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const U = 39.37;

/**
 * Una rata de Edana, con su ficha leída del mod, y un jugador DE PIE delante.
 *
 * `aU` son unidades de separación horizontal; el jugador va siempre con su
 * centro a 36, que es donde el motor lo mide.
 */
function ratayJugador(aU = SEPARACION_MINIMA, azar = dado(5), relacion = RELACION.RECELO) {
  const manada = new Manada({
    mapa: "liso", unidadesPorMetro: U,
    razas: [["vermin", { odia: ["human"] }], ["human", {}]],
    modelos: [{ clave: "rata", carpeta: "bichos/monsters_giant_rat" }],
    colocados: [{
      clase: "msmonster_giantrat", script: "monsters/giantrat", clave: "rata",
      nombre: "Giant Rat", hp: 4, ancho: RATA.ancho, alto: RATA.alto,
      parado: "idle1", andando: "walk", piel: 0,
      escena: [0, 0, 0], yaw: 0, luz: [189, 187, 144],
      // LA RELACIÓN DE VERDAD, QUE ES RECELO Y NO ODIO.
      //
      // Lo escribí primero con `ODIO` y `hostil: true`, copiado del arnés del
      // 80, y eso es **una rata que no existe**: `vermin` recela de `human`, así
      // que la de Edana no te ataca por verte y hay que provocarla. Con la rata
      // hostil las pruebas del mordisco salían verdes midiendo un bicho que el
      // juego no tiene — y encima se tragaban la mitad del fallo, que era justo
      // que no llegaba a ficharte.
      hostil: relacion <= RELACION.DESPRECIO, relacion,
      ia: RATA.ia,
    }],
  }, {
    secuenciasPorClave: new Map([["rata", SECUENCIAS_RATA]]),
    cajasPorClave: new Map([["rata", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
    azar,
  });
  /** Intentos (pensó «golpear») e impactos (acertó el dado), que NO son lo mismo. */
  const cuentas = { intentos: 0, impactos: 0, dano: 0 };
  // EL JUGADOR SE MUEVE CON LA RATA, a `aU` unidades fijas. Puesto en un punto
  // absoluto no se mide la separación: se mide cuánto corre la rata, y con sus
  // 76 unidades por segundo llega a cualquier sitio en diez segundos —el
  // control de «lejos no pega» salió rojo con el trabajo bien hecho, porque la
  // rata simplemente había llegado. Fijando la separación, `aU` es lo único
  // que cambia entre un caso y el otro.
  const arnes = {
    libre: () => true,
    suelo: () => 0,
    veA: () => true,
    objetivos: () => {
      const n = manada.instancias[0].donde;
      return [{
        id: "jugador",
        donde: [n[0] * U + aU, n[1] * U + CENTRO_DEL_JUGADOR, n[2] * U],
        esJugador: true,
        // LA RELACIÓN LA DA LA FICHA DEL BICHO, como en el juego
        // (`objetivos(i)` en main.js y fauna.js pasan `i.ficha.relacion`).
        // Escribirla a mano aquí era el 59: con un `ODIO` fijo la rata me
        // atacaba por verme y la mitad del fallo quedaba tapada.
        relacion: manada.instancias[0].ficha.relacion,
        ancho: 0,
      }];
    },
    golpear: (_i, _id, dano) => { cuentas.impactos++; cuentas.dano += dano; },
  };
  // LOS INTENTOS SE LEEN DE `sucesos`, QUE ES LO QUE PASÓ.
  //
  // Lo escribí primero mirando `i.intencion`, y eso cuenta **fotogramas con la
  // intención puesta**: la intención sobrevive entre ciclos de pensar, así que
  // diez segundos daban 177 intentos y una tasa de acierto del 5 % — el 67 y el
  // 68 otra vez («un contador de cuántas veces se ha pedido no mide cuántas
  // veces ha pasado»), y pisado mientras escribía la prueba que los cita.
  //
  // `pega` y `falla` los emite `cazar` UNA VEZ por golpe de verdad, justo donde
  // se tira el dado, así que su suma son los intentos y `pega` son los impactos.
  const correr = (segundos) => {
    for (let t = 0; t < segundos; t += 1 / 60) manada.cazar(1 / 60, arnes);
    cuentas.intentos = manada.sucesos.filter((s) => s.que === "pega" || s.que === "falla").length;
  };
  /**
   * PEGARLE PRIMERO, que es lo que hace el jugador que reporta el fallo.
   *
   * Medio punto de daño: suficiente para disparar `struck_by_enemy` y lejos de
   * los 4 de vida de la rata, que muerta no devuelve nada.
   */
  const provocar = () => manada.herir(manada.instancias[0], 0.5, {
    tipo: "slash", ahora: 0, dados: { quien: "jugador" },
  });
  return { manada, cuentas, correr, provocar };
}

describe("una rata muerde a un jugador de pie, por el camino del juego", () => {
  test("le pega: en diez segundos entra más de una vez", () => {
    const { cuentas, correr, provocar } = ratayJugador();
    provocar();
    correr(10);
    assert.ok(cuentas.impactos > 0,
      `la rata no acertó ni una vez en 10 s (intentos: ${cuentas.intentos})`);
    assert.ok(cuentas.dano > 0, "y el daño que entrega no es cero");
  });

  test("y el daño de cada mordisco son los 0,4 de su archivo", () => {
    const { cuentas, correr, provocar } = ratayJugador();
    provocar();
    correr(10);
    assert.equal(Math.round((cuentas.dano / cuentas.impactos) * 10) / 10, 0.4);
  });

  test("CONTROL POSITIVO: a cuatro metros no le pega, y es la misma rata", () => {
    // El par que hace que el verde de arriba signifique algo. Si esto también
    // dijera «te pega», lo de arriba no mediría el alcance: mediría que la
    // rata pega siempre. Y la rata no avanza porque `libre` la deja andar pero
    // el arnés le mueve el objetivo con ella: lo que se fija es la separación.
    const { cuentas, correr, provocar } = ratayJugador(400);
    provocar();
    correr(10);
    assert.equal(cuentas.impactos, 0);
    assert.equal(cuentas.intentos, 0, "ni lo intenta: no es que falle el dado");
  });

  test("los intentos NO son los impactos, con el 30 % del archivo en medio", () => {
    // `ATTACK_HITCHANCE 30%`: siete de cada diez mordiscos no hacen nada, y eso
    // es del mod. Es la razón de que el fallo se leyera como «no me pega
    // nunca» incluso cuando pegaba: sin texto y sin daño, un fallo no se ve.
    const { cuentas, correr, provocar } = ratayJugador();
    provocar();
    correr(60);
    assert.ok(cuentas.intentos > cuentas.impactos,
      `con 30 % de acierto tiene que fallar alguno: ${cuentas.impactos} de ${cuentas.intentos}`);
    const tasa = cuentas.impactos / cuentas.intentos;
    assert.ok(tasa > 0.15 && tasa < 0.5,
      `la tasa de acierto salió ${(tasa * 100).toFixed(0)} %, y el archivo dice 30 %`);
  });

  test("y el ritmo es el de `HACK_ATTACK_DELAY`: un mordisco por segundo, no sesenta", () => {
    // Sin la espera entre golpes la rata pegaría en cada fotograma y sus 0,4
    // serían 24 de daño por segundo. Lo que se cuenta aquí son INTENTOS, que
    // es lo que la espera limita.
    const { cuentas, correr, provocar } = ratayJugador();
    provocar();
    correr(10);
    assert.ok(cuentas.intentos <= 11,
      `en 10 s no caben más de once intentos y hubo ${cuentas.intentos}`);
    assert.ok(cuentas.intentos >= 5, `y tampoco uno: hubo ${cuentas.intentos}`);
  });
});

// ── DEVOLVER EL GOLPE, que es la otra mitad del fallo ───────────────────────
//
// Las de arriba demuestran que una rata que te tiene fichado te muerde. Lo que
// faltaba antes de eso es que llegara a ficharte: `vermin` RECELA de `human`,
// y quien recela no es «enemigo» para la caza, así que una rata no te toma como
// objetivo ni viéndote. El único camino es la rama `struck_by_enemy` del golpe
// recibido (base_npc_attack_new.script:1078-1083), que no estaba portada.
//
// Y lo que hizo difícil verlo: su hermana del mismo `if`, `npcatk_retaliate`,
// SÍ estaba portada, estudiada y con pruebas que demuestran que el mod la tiene
// muerta. Una rama muerta al lado de una rama que falta.

const razas = leerRazas(SCRIPTS);

describe("una rata recela, y eso no es que sea pacífica", () => {
  test("`vermin` recela de `human`: ni enemigo ni aliado", () => {
    const r = relacionDeRazas(razas, "vermin", RAZA_DEL_JUGADOR);
    assert.equal(r, RELACION.RECELO);
    assert.equal(esEnemigo(r), false,
      "y por eso la caza no la hace atacarte: RECELO no cuenta (npcscript.cpp:1806)");
  });

  test("la rata de Edana es de esa raza", () => {
    assert.equal(RATA.ia.raza, "vermin");
  });
});

describe("`struck_by_enemy`: la rama viva", () => {
  test("a quien recela y no tiene objetivo, le pegas y te apunta", () => {
    assert.equal(apuntaAlQueTePega({ relacion: RELACION.RECELO }).apunta, true);
  });

  test("y con el objetivo puesto en un jugador también: eso es `L_FIRST_STRUCK`", () => {
    assert.equal(apuntaAlQueTePega({
      relacion: RELACION.RECELO, tengoObjetivo: true, objetivoEsJugador: true,
    }).apunta, true);
  });

  test("CONTROL NEGATIVO: peleando ya con otro bicho, NO — eso es la rama muerta", () => {
    const a = apuntaAlQueTePega({
      relacion: RELACION.RECELO, tengoObjetivo: true, objetivoEsJugador: false,
    });
    assert.equal(a.apunta, false);
    assert.match(a.porque, /retaliate/);
  });

  test("CONTROL NEGATIVO: huyendo tampoco (`if !IS_FLEEING`)", () => {
    assert.equal(apuntaAlQueTePega({ relacion: RELACION.RECELO, huyendo: true }).apunta, false);
  });

  test("CONTROL NEGATIVO: y la rama pide `equals wary`, así que el odio no entra por aquí", () => {
    // Un goblin no llega a ti por esta puerta: llega por `$cansee(enemy)`, que
    // es otro camino y ya funcionaba. Portar esto como «si te pegan, apunta»
    // habría cambiado a los 33 hostiles de Gate City sin que nadie lo pidiera.
    assert.equal(apuntaAlQueTePega({ relacion: RELACION.ODIO }).apunta, false);
    assert.equal(apuntaAlQueTePega({ relacion: RELACION.ALIADO }).apunta, false);
    assert.equal(apuntaAlQueTePega({ relacion: null }).apunta, false);
  });
});

describe("y por el camino del juego: le pego a la rata y me muerde", () => {
  test("sin pegarle no te ficha, y en cuanto le pegas sí", () => {
    const { manada, correr, provocar } = ratayJugador();
    const i = manada.instancias[0];
    correr(2);
    assert.equal(i.cazador.objetivo, null,
      "una rata recelosa no te ataca por verte, y eso es fiel al mod");

    provocar();
    assert.equal(i.cazador.objetivo, "jugador", "`struck_by_enemy`");
  });

  test("Y ENTONCES MUERDE: el viaje entero, de la provocación al daño", () => {
    // Éste es el control del fallo que reportó el usuario, de punta a punta.
    const { cuentas, correr, provocar } = ratayJugador();
    provocar();
    correr(12);
    assert.ok(cuentas.impactos > 0,
      `le pegué y no me devolvió el golpe en 12 s (intentos ${cuentas.intentos})`);
    assert.ok(cuentas.dano > 0);
  });

  test("CONTROL POSITIVO: provocada pero lejos, sigue sin alcanzarme", () => {
    const { manada, cuentas, correr, provocar } = ratayJugador(400);
    provocar();
    correr(12);
    assert.equal(cuentas.impactos, 0, "tiene objetivo, pero no alcance");
    assert.equal(manada.instancias[0].cazador.objetivo, "jugador",
      "y el control vale porque sí le había fichado: lo que falta es la distancia");
  });
});
