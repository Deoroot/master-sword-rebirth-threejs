// LA CAZA y LAS RAZAS, comprobadas sin navegador.
//
// Las dos mitades del «¿me ataca este bicho?»: la tabla de razas dice QUIÉN, y
// `npcatk_hunt` dice CÓMO. Varias de estas traen control negativo porque
// describen asimetrías que parecen erratas —el orden aliado-antes-que-enemigo,
// el recelo que es negativo y no cuenta, los tres alcances distintos— y que si
// alguien «simplifica» no dan error: dan otro juego.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  leerRazas, relacionDeRazas, esEnemigo, RELACION, RAZA_DEL_JUGADOR,
  leerFichaNpc, modeloYAnimaciones,
} from "../src/bsp/script.js";
import { Cazador, ACCION, CICLO, acierta, danoDe, cercaniaDe } from "../src/play/ia.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const razas = leerRazas(SCRIPTS);

describe("la tabla de razas", () => {
  test("se lee entera", () => {
    assert.ok(razas && razas.size >= 20, `salieron ${razas?.size}`);
    assert.ok(razas.has("goblin") && razas.has("human") && razas.has("undead"));
  });

  test("el goblin ataca al jugador y el aldeano no", () => {
    assert.equal(esEnemigo(relacionDeRazas(razas, "goblin", RAZA_DEL_JUGADOR)), true);
    assert.equal(esEnemigo(relacionDeRazas(razas, "human", RAZA_DEL_JUGADOR)), false);
  });

  test("y el aldeano no le ataca AUNQUE tenga «all» en sus enemigos", () => {
    // Ésta es la que caza el orden. `human` declara `enemies all;hated` y
    // `allies human;beloved`, y el jugador es humano. Mirando los enemigos
    // primero, el pueblo entero te ataca — y no daría ningún error.
    assert.ok(razas.get("human").enemigos.includes("all"));
    assert.equal(relacionDeRazas(razas, "human", "human"), RELACION.ALIADO);
  });

  test("el recelo gana a todo, y va en los dos sentidos", () => {
    // `hguard` recela de `human`, y `human` no recela de nadie. Basta con uno.
    assert.equal(razas.get("human").recelo.includes("hguard"), false);
    assert.equal(relacionDeRazas(razas, "hguard", "human"), RELACION.RECELO);
    assert.equal(relacionDeRazas(razas, "human", "hguard"), RELACION.RECELO);
  });

  test("y un receloso NO es un enemigo, aunque su número sea negativo", () => {
    // RECELO vale −2. «relación < 0» diría que sí, y entonces los guardias y
    // las ratas de Gate City te atacarían nada más verte. El motor usa un
    // `switch` con cuatro casos y RECELO no está.
    assert.ok(RELACION.RECELO < 0);
    assert.equal(esEnemigo(RELACION.RECELO), false);
    assert.equal(esEnemigo(relacionDeRazas(razas, "hguard", RAZA_DEL_JUGADOR)), false);
    assert.equal(esEnemigo(relacionDeRazas(razas, "vermin", RAZA_DEL_JUGADOR)), false);
  });

  test("una raza que no existe no es enemiga de nadie", () => {
    assert.equal(relacionDeRazas(razas, "inventada", "human"), RELACION.SIN_RAZA);
    assert.equal(esEnemigo(RELACION.SIN_RAZA), false);
  });

  test("la raza del jugador no sale de ningún script", () => {
    // La devuelve el motor a pelo (`script.cpp:1546`). Si se dedujera de un
    // script se cogería la del NPC humano, que no es lo mismo.
    assert.equal(RAZA_DEL_JUGADOR, "human");
  });
});

describe("la ficha de combate del goblin", () => {
  const f = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/goblin")).ia;

  test("sale del .script y no de un número elegido", () => {
    assert.equal(f.alcanceDeGolpe, 130);
    assert.equal(f.alcanceDeImpacto, 130);
    assert.equal(f.alcanceParaPararse, 90);
    assert.deepEqual(f.dano, { min: 6, max: 9 });
    assert.equal(f.aciertos.min, 60);
    assert.equal(f.raza, "goblin");
    assert.equal(f.vida, 50);
  });

  test("la animación de perseguir NO es la de pasear", () => {
    // `ANIM_RUN run` contra `setmoveanim walk`. Usar la de pasear para
    // perseguir da un monstruo que te sigue dando un paseo.
    assert.equal(f.corriendo, "run");
    assert.equal(f.andando, "walk");
    assert.notEqual(f.corriendo, f.andando);
  });

  test("y la cercanía de destino es del motor, no del script", () => {
    // `m_Width * 1.1` (msmonster.h:355). 32 × 1,1 = 35,2.
    assert.equal(f.cercaniaDeDestino, cercaniaDe(32));
    assert.ok(Math.abs(f.cercaniaDeDestino - 35.2) < 1e-9);
  });

  test("CAN_HUNT se lee pero no decide: es del script viejo", () => {
    // El goblin lo pone a 1 y el enano no lo pone. Si esto decidiera la
    // hostilidad, el zombi —que tampoco lo pone— sería pacífico.
    assert.equal(f.canHuntViejo, 1);
    const zombi = modeloYAnimaciones(leerFichaNpc(SCRIPTS, "monsters/zombie")).ia;
    assert.equal(zombi.canHuntViejo, null);
    assert.equal(esEnemigo(relacionDeRazas(razas, zombi.raza, RAZA_DEL_JUGADOR)), true,
      "y sin embargo el zombi SÍ ataca, porque lo dice su raza");
  });
});

describe("el ciclo de caza", () => {
  const FICHA = {
    alcanceDeGolpe: 130, alcanceDeImpacto: 130, alcanceParaPararse: 90,
    cercaniaDeDestino: 35.2, ancho: 32, pasea: true,
    aciertos: { min: 60, max: 60 }, dano: { min: 6, max: 9 },
    tieneQueVerte: false,
  };
  const enemigo = (donde, extra = {}) => ({
    id: "jug", donde, esJugador: true, relacion: RELACION.ODIO, ...extra,
  });
  /** Corre un ciclo entero: avanza el reloj lo justo para que piense. */
  const piensa = (c, mundo) => c.tic(c.reloj + 1e-6, mundo);
  /**
   * Avanza el tiempo a pasos de fotograma y devuelve el último pensamiento.
   *
   * Hace falta porque saltar un ciclo entero de golpe **se come la espera
   * entre golpes**: el primer ciclo tras ver a alguien todavía dura 2 s, así
   * que un `tic(2.0)` gasta de una vez el segundo de recarga. Lo escribí así
   * primero y la prueba de la recarga daba «golpea otra vez» sin que nada
   * estuviera mal en el código.
   */
  const avanzar = (c, mundo, segundos) => {
    let ultimo = null;
    for (let t = 0; t < segundos; t += 1 / 60) {
      const r = c.tic(1 / 60, typeof mundo === "function" ? mundo() : mundo);
      if (r) ultimo = r;
    }
    return ultimo;
  };

  test("sin nadie a la vista, pasea", () => {
    const c = new Cazador(FICHA);
    assert.equal(piensa(c, { donde: [0, 0, 0], candidatos: [] }).accion, ACCION.PASEAR);
  });

  test("y uno que no pasea se queda quieto", () => {
    const c = new Cazador({ ...FICHA, pasea: false });
    assert.equal(piensa(c, { donde: [0, 0, 0], candidatos: [] }).accion, ACCION.NADA);
  });

  test("ve a un enemigo y lo persigue", () => {
    const c = new Cazador(FICHA);
    const r = piensa(c, { donde: [0, 0, 0], candidatos: [enemigo([500, 0, 0])] });
    assert.equal(r.accion, ACCION.PERSEGUIR);
    assert.equal(r.objetivo, "jug");
    assert.deepEqual(r.destino, [500, 0, 0]);
    assert.equal(r.cerca, 90, "se para a MOVE_RANGE, no encima");
  });

  test("y a un aliado NO", () => {
    const c = new Cazador(FICHA);
    const r = piensa(c, {
      donde: [0, 0, 0],
      candidatos: [enemigo([500, 0, 0], { relacion: RELACION.ALIADO })],
    });
    assert.equal(r.accion, ACCION.PASEAR);
  });

  test("a un receloso tampoco, aunque su relación sea negativa", () => {
    const c = new Cazador(FICHA);
    const r = piensa(c, {
      donde: [0, 0, 0],
      candidatos: [enemigo([500, 0, 0], { relacion: RELACION.RECELO })],
    });
    assert.equal(r.accion, ACCION.PASEAR);
  });

  test("de cerca, golpea", () => {
    const c = new Cazador(FICHA);
    const r = piensa(c, { donde: [0, 0, 0], candidatos: [enemigo([100, 0, 0])] });
    assert.equal(r.accion, ACCION.GOLPEAR);
  });

  test("y justo fuera de ATTACK_RANGE, no", () => {
    const c = new Cazador(FICHA);
    const r = piensa(c, { donde: [0, 0, 0], candidatos: [enemigo([131, 0, 0])] });
    assert.equal(r.accion, ACCION.PERSEGUIR);
  });

  test("los tres alcances son tres y no uno", () => {
    // Con MOVE_RANGE 90 y ATTACK_RANGE 130 hay una franja en la que YA pega y
    // TODAVÍA se acerca. Colapsarlos deja al bicho pegado al jugador o
    // pegando desde lejos, y las dos cosas parecen «la IA va rara».
    assert.ok(FICHA.alcanceParaPararse < FICHA.alcanceDeGolpe);
    const c = new Cazador(FICHA);
    const r = piensa(c, { donde: [0, 0, 0], candidatos: [enemigo([120, 0, 0])] });
    assert.equal(r.accion, ACCION.GOLPEAR);
    assert.deepEqual(r.destino, [120, 0, 0], "y sigue teniendo a dónde ir");
  });

  test("tras golpear espera antes del siguiente", () => {
    const c = new Cazador(FICHA);
    const mundo = { donde: [0, 0, 0], candidatos: [enemigo([100, 0, 0])] };
    assert.equal(piensa(c, mundo).accion, ACCION.GOLPEAR);
    c.haGolpeado(1.0);
    assert.notEqual(avanzar(c, mundo, 0.5)?.accion, ACCION.GOLPEAR, "medio segundo es pronto");
    assert.equal(avanzar(c, mundo, 2.5).accion, ACCION.GOLPEAR, "y al pasar la espera, otra vez");
  });

  test("el primer ciclo de combate tarda 2 s, no 0,1", () => {
    // El motor programa el siguiente pensamiento con `callevent CYCLE_TIME
    // npcatk_hunt` en la PRIMERA línea del evento, o sea con el reloj que
    // tenía AL ENTRAR — y sólo después se entera de que hay objetivo. Así que
    // ver a alguien no acelera este ciclo: acelera el siguiente.
    const c = new Cazador(FICHA);
    const mundo = { donde: [0, 0, 0], candidatos: [enemigo([500, 0, 0])] };
    piensa(c, mundo);
    assert.equal(c.objetivo, "jug");
    assert.equal(c.reloj, CICLO.ocioso, "programado con el reloj de estar parado");
    assert.equal(c.ciclo, CICLO.combate, "pero a partir de ahora va en combate");
  });

  test("muy lejos, lo olvida", () => {
    const c = new Cazador(FICHA);
    piensa(c, { donde: [0, 0, 0], candidatos: [enemigo([500, 0, 0])] });
    assert.equal(c.objetivo, "jug");
    const r = piensa(c, { donde: [0, 0, 0], candidatos: [enemigo([5000, 0, 0])] });
    assert.equal(r.porQue, "fuera_de_alcance");
    assert.equal(c.objetivo, null);
  });
});

describe("los dos relojes", () => {
  const FICHA = { alcanceDeGolpe: 130, alcanceDeImpacto: 130, alcanceParaPararse: 90, ancho: 32, cercaniaDeDestino: 35.2, pasea: true };

  test("parado piensa cada 2 s y en combate cada 0,1", () => {
    const c = new Cazador(FICHA);
    assert.equal(c.ciclo, CICLO.ocioso);
    c.tic(3, { donde: [0, 0, 0], candidatos: [{ id: "j", donde: [300, 0, 0], esJugador: true, relacion: RELACION.ODIO }] });
    assert.equal(c.ciclo, CICLO.combate);
    assert.ok(CICLO.ocioso / CICLO.combate === 20);
  });

  test("y entre ciclo y ciclo no piensa", () => {
    const c = new Cazador(FICHA);
    c.tic(3, { donde: [0, 0, 0], candidatos: [] });
    assert.equal(c.tic(0.5, { donde: [0, 0, 0], candidatos: [] }), null);
  });
});

describe("al perderlo de vista", () => {
  const FICHA = {
    alcanceDeGolpe: 130, alcanceDeImpacto: 130, alcanceParaPararse: 90,
    cercaniaDeDestino: 35.2, ancho: 32, pasea: true, tieneQueVerte: false,
  };
  const jug = (donde) => ({ id: "jug", donde, esJugador: true, relacion: RELACION.ODIO });
  const piensaYa = (c, mundo) => c.tic(c.reloj + 1e-6, mundo);

  test("va a donde lo vio, no a donde está", () => {
    const c = new Cazador(FICHA);
    piensaYa(c, { donde: [0, 0, 0], candidatos: [jug([500, 0, 0])] });
    const r = piensaYa(c, { donde: [0, 0, 0], candidatos: [jug([900, 0, 300])], veA: () => false });
    assert.equal(r.accion, ACCION.BUSCAR);
    assert.deepEqual(r.destino, [500, 0, 0], "la última posición conocida");
  });

  test("y al llegar se inventa un punto cerca del objetivo real", () => {
    // Sin esto, un monstruo al que esquivas se queda mirando una esquina.
    const c = new Cazador(FICHA, { azar: () => 0 });
    piensaYa(c, { donde: [0, 0, 0], candidatos: [jug([500, 0, 0])] });
    const r = piensaYa(c, { donde: [500, 0, 0], candidatos: [jug([900, 0, 0])], veA: () => false });
    assert.equal(r.accion, ACCION.BUSCAR);
    assert.notDeepEqual(r.destino, [500, 0, 0]);
    // 128 unidades del objetivo real, con el azar fijado a 0 -> +X.
    assert.deepEqual(r.destino.map((v) => Math.round(v)), [1028, 0, 0]);
  });
});

describe("el golpe", () => {
  const F = { aciertos: { min: 60, max: 60 }, dano: { min: 6, max: 9 } };

  test("acierta el 60 % de las veces, ni siempre ni nunca", () => {
    assert.equal(acierta(F, () => 0.59), true);
    assert.equal(acierta(F, () => 0.61), false);
  });

  test("y sin ATTACK_HITCHANCE acierta siempre, que es el caso del script que no lo pone", () => {
    assert.equal(acierta({}, () => 0.99), true);
  });

  test("el daño está en su rango y no es un número fijo", () => {
    assert.equal(danoDe(F, () => 0), 6);
    assert.equal(danoDe(F, () => 1), 9);
    assert.notEqual(danoDe(F, () => 0), danoDe(F, () => 1));
  });

  test("y sin ATTACK_DAMAGE no hace daño en vez de inventarse uno", () => {
    assert.equal(danoDe({}, () => 0.5), 0);
  });
});
