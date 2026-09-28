// EL ESCUDO: el bloqueo, el cono y la máquina de la mano.
//
// Cada número de aquí sale del script o del motor y está citado en `escudo.js`.
// Las que más valen son las cuatro que fijan un FALLO portado tal cual: el cono
// en radianes, el aguante que no se cobra, el escudo que no se rompe y el parry
// que se apaga cuando el escudo abajo funciona.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CONO_DEL_ESCUDO, conoDelMotor, semianguloReal, dentroDelCono2D, NO_BLOQUEA,
  POSTURA, bloqueoDelEscudo, danoEsperado, puedeAtacar, defensaDelJugador, Brazal,
} from "../src/play/escudo.js";
import { leerFichaObjeto } from "../src/bsp/script.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const hay = (() => {
  try { return Boolean(leerFichaObjeto(SCRIPTS, "items/shields_buckler")); }
  catch { return false; }
})();

/** Un escudo de entrenamiento a mano, para no depender de que estén los scripts. */
const BUCKLER = {
  multiplicadorDeParry: 1.3, bloqueoArriba: 100, danoQuePasa: 0.4,
  bloqueoAbajo: 15, vida: 500, inmortal: false,
};
const MADERA = {
  multiplicadorDeParry: 1.25, bloqueoArriba: 90, danoQuePasa: 0.6,
  bloqueoAbajo: 15, vida: 200, inmortal: false,
};

// ── EL CONO, que es el fallo gordo ─────────────────────────────────────────

test("el cono de 175 grados del escudo mide 53 de verdad, porque cosf quiere radianes", () => {
  assert.equal(CONO_DEL_ESCUDO, 175);
  // `cosf(175/2)` = cos(87,5 RADIANES) = 0,894, un umbral altísimo.
  assert.ok(Math.abs(conoDelMotor(175) - 0.894003) < 1e-5);
  assert.ok(Math.abs(semianguloReal(175) - 26.62) < 0.01);
});

test("y el error no empequeñece siempre: 30 grados salen 279 y 100 salen 30", () => {
  // El coseno es cíclico, así que la relación entre lo declarado y lo real no es
  // ni monótona. Declarar MÁS puede dar un cono MENOR.
  assert.ok(Math.abs(semianguloReal(30) * 2 - 278.87) < 0.02);
  assert.ok(Math.abs(semianguloReal(100) * 2 - 30.42) < 0.02);
  assert.ok(semianguloReal(100) < semianguloReal(30));
});

test("un golpe de frente entra en el cono y uno a 40 grados ya no", () => {
  const yo = [0, 0, 0];
  const mirando = [0, 0, -1];          // mirando a la -z, como la cámara
  const enAngulo = (g) => {
    const r = (g * Math.PI) / 180;
    return [Math.sin(r) * 10, 0, -Math.cos(r) * 10];
  };
  assert.equal(dentroDelCono2D(enAngulo(0), yo, mirando), true);
  assert.equal(dentroDelCono2D(enAngulo(26), yo, mirando), true);
  assert.equal(dentroDelCono2D(enAngulo(27), yo, mirando), false);
  assert.equal(dentroDelCono2D(enAngulo(40), yo, mirando), false);
  // Y por la espalda, que es lo único que el script quería excluir, tampoco.
  assert.equal(dentroDelCono2D(enAngulo(180), yo, mirando), false);
});

test("la altura no cuenta: el cono es de dos dimensiones", () => {
  const yo = [0, 0, 0];
  // Justo delante pero veinte metros más arriba. En 3D no estaría en el cono.
  assert.equal(dentroDelCono2D([0, 20, -1], yo, [0, 0, -1]), true);
  // Y encima del todo, sin distancia horizontal, no hay dirección: no bloquea.
  assert.equal(dentroDelCono2D([0, 20, 0], yo, [0, 0, -1]), false);
});

// ── EL BLOQUEO ─────────────────────────────────────────────────────────────

test("con el escudo arriba el de entrenamiento bloquea siempre y deja pasar el 40 %", () => {
  const r = bloqueoDelEscudo({
    ficha: BUCKLER, postura: POSTURA.ARRIBA, dano: 10, tipo: "slash", dados: { arriba: 100 },
  });
  assert.equal(r.bloquea, true);
  assert.equal(r.arriba, true);
  assert.equal(r.dano, 4);
  // Bloquear no es anular, y por eso no hay mensaje: el golpe ha dolido.
  assert.equal(r.mensaje, null);
});

test("el de madera falla el bloqueo el 10 % de las veces y entonces entra entero", () => {
  const bien = bloqueoDelEscudo({ ficha: MADERA, postura: POSTURA.ARRIBA, dano: 10, dados: { arriba: 90 } });
  assert.equal(bien.dano, 6);
  const mal = bloqueoDelEscudo({ ficha: MADERA, postura: POSTURA.ARRIBA, dano: 10, dados: { arriba: 91 } });
  assert.equal(mal.bloquea, false);
  assert.equal(mal.dano, 10);
});

test("con el escudo abajo no se rebaja el golpe: se anula entero o no se anula", () => {
  const va = bloqueoDelEscudo({ ficha: BUCKLER, postura: POSTURA.ABAJO, dano: 10, dados: { abajo: 15 } });
  assert.equal(va.dano, 0);
  assert.equal(va.mensaje, "Deflected!");
  assert.equal(va.baja, true);
  const no = bloqueoDelEscudo({ ficha: BUCKLER, postura: POSTURA.ABAJO, dano: 10, dados: { abajo: 16 } });
  assert.equal(no.dano, 10);
  assert.equal(no.mensaje, null);
});

test("de media, arriba te llevas 0,40 y abajo 0,85: mejor, pero no tres veces mejor", () => {
  assert.equal(danoEsperado(BUCKLER, POSTURA.ARRIBA), 0.4);
  assert.equal(danoEsperado(BUCKLER, POSTURA.ABAJO), 0.85);
  // Y el de madera arriba (0,64) sigue siendo mejor que cualquiera abajo.
  assert.ok(Math.abs(danoEsperado(MADERA, POSTURA.ARRIBA) - 0.64) < 1e-9);
});

test("un escudo a la espalda no bloquea nada, y es la primera línea del evento", () => {
  const r = bloqueoDelEscudo({
    ficha: BUCKLER, postura: POSTURA.ARRIBA, dano: 10, desplegado: false, dados: { arriba: 1 },
  });
  assert.equal(r.bloquea, false);
  assert.equal(r.dano, 10);
  assert.equal(r.porque, "guardado");
});

test("lo que viene de fuera del cono no se bloquea aunque el escudo esté arriba", () => {
  const r = bloqueoDelEscudo({
    ficha: BUCKLER, postura: POSTURA.ARRIBA, dano: 10, deFrente: false, dados: { arriba: 1 },
  });
  assert.equal(r.bloquea, false);
  assert.equal(r.porque, "no viene de frente");
});

test("el daño propio no se bloquea: «don't freeze self shielding from effects»", () => {
  const r = bloqueoDelEscudo({
    ficha: BUCKLER, postura: POSTURA.ARRIBA, dano: 10, esElPropio: true, dados: { arriba: 1 },
  });
  assert.equal(r.bloquea, false);
  assert.equal(r.porque, "es mío");
});

// ── LOS TIPOS DE DAÑO, y la asimetría con el parry ─────────────────────────

test("el escudo sólo se salta dos tipos, y frío, fuego y veneno están COMENTADOS", () => {
  assert.deepEqual(NO_BLOQUEA.prefijos, ["target"]);
  assert.deepEqual(NO_BLOQUEA.contiene, ["effect"]);
  for (const tipo of ["fire", "cold", "poison", "lightning", "magic"]) {
    const r = bloqueoDelEscudo({
      ficha: BUCKLER, postura: POSTURA.ARRIBA, dano: 10, tipo, dados: { arriba: 1 },
    });
    assert.equal(r.bloquea, true, `${tipo} debería bloquearse: su línea está comentada`);
  }
  for (const tipo of ["target", "dark_effect"]) {
    const r = bloqueoDelEscudo({
      ficha: BUCKLER, postura: POSTURA.ARRIBA, dano: 10, tipo, dados: { arriba: 1 },
    });
    assert.equal(r.bloquea, false, `${tipo} no se bloquea`);
  }
});

test("un tipo VACÍO se bloquea — justo al revés que en el parry del script", () => {
  // El goblin pega sin declarar tipo de daño, y eso en el parry del script lo
  // hace imparable. En el escudo lo hace bloqueable. El mismo hueco, dos reglas.
  const r = bloqueoDelEscudo({
    ficha: BUCKLER, postura: POSTURA.ARRIBA, dano: 10, tipo: "", dados: { arriba: 1 },
  });
  assert.equal(r.bloquea, true);
  assert.equal(r.dano, 4);
});

// ── EL ORDEN CONTRA EL JUGADOR ─────────────────────────────────────────────

test("el escudo corre ANTES del parry, y el escudo abajo apaga el parry", () => {
  // Parry 60 y consciencia 20 sería casi imparable... pero el escudo abajo ya
  // dejó el daño en 0, y el parry del motor no para los ceros.
  const r = defensaDelJugador({
    dano: 10, tipo: "slash", escudo: BUCKLER, postura: POSTURA.ABAJO,
    parry: 60, consciencia: 20, dados: { abajo: 1, parry: 60, acierto: 1 },
  });
  assert.equal(r.dano, 0);
  assert.equal(r.bloqueo.bloquea, true);
  assert.equal(r.parado, false, "el parry no llega a correr sobre un cero");
  assert.equal(r.parry.porque, "daño 0");
});

test("con el escudo arriba el parry sí puede parar lo que el escudo deja pasar", () => {
  const r = defensaDelJugador({
    dano: 10, tipo: "slash", escudo: BUCKLER, postura: POSTURA.ARRIBA,
    parry: 60, consciencia: 20, dados: { arriba: 1, parry: 60, acierto: 1 },
  });
  assert.equal(r.bloqueo.dano, 4);
  assert.equal(r.parado, true);
  assert.equal(r.dano, 0);
});

test("sin escudo la defensa es sólo el parry, y un personaje nuevo no tiene", () => {
  const r = defensaDelJugador({ dano: 10, tipo: "slash", parry: 0, dados: { acierto: 1 } });
  assert.equal(r.dano, 10);
  assert.equal(r.parado, false);
});

// ── NO SE PUEDE ATACAR CUBRIÉNDOSE ────────────────────────────────────────

test("un escudo levantado impide atacar con la OTRA mano", () => {
  const espada = { id: "swords_rsword", cubriendose: false };
  const escudo = { id: "shields_buckler", cubriendose: true };
  assert.equal(puedeAtacar({ objetos: [espada, escudo] }), false);
  assert.equal(puedeAtacar({ objetos: [espada, { ...escudo, cubriendose: false }] }), true);
});

test("y el criterio es el NOMBRE del script, no la marca de escudo", () => {
  // Un objeto que bloquee pero no se llame `shields_…` te deja atacar mientras
  // te cubres. En el juego no pasa; en un script nuevo, sí.
  assert.equal(puedeAtacar({ objetos: [{ id: "buckler_raro", cubriendose: true }] }), true);
});

// ── LA MANO ────────────────────────────────────────────────────────────────

test("el escudo no caduca: tDuration -1 pisa el MELEE_ATK_DURATION del script", () => {
  const b = new Brazal({ ataques: [{ tipo: "hold-strike", duracion: 1, retardo: 0.1, aguante: 0 }], escudo: BUCKLER });
  b.desplegar(true);
  assert.equal(b.tic(0.016, { pulsado: true }).sube, true);
  let t = 0;
  for (let i = 0; i < 600; i++) { b.tic(0.05, { pulsado: true }); t += 0.05; }
  assert.ok(t > 29, "treinta segundos aguantando");
  assert.equal(b.arriba, true, "sigue arriba pasada la duración declarada");
  assert.equal(b.postura, POSTURA.ARRIBA);
});

test("la postura del muñeco cae a delay.strike y una sola vez", () => {
  const b = new Brazal({ ataques: [{ tipo: "hold-strike", duracion: 1, retardo: 0.1, aguante: 0 }] });
  b.desplegar(true);
  b.tic(0.016, { pulsado: true });
  assert.equal(b.tic(0.05, { pulsado: true }).postura, false, "todavía no llega a 0,1");
  assert.equal(b.tic(0.06, { pulsado: true }).postura, true);
  assert.equal(b.tic(0.5, { pulsado: true }).postura, false, "una sola vez");
});

test("levantar el escudo es gratis: el ataque declara energydrain 0", () => {
  const b = new Brazal({ ataques: [{ tipo: "hold-strike", duracion: 1, retardo: 0.1, aguante: 0 }] });
  b.desplegar(true);
  assert.equal(b.tic(0.016, { pulsado: true }).aguante, 0);
});

test("guardarlo lo baja, y sin desplegar no sube", () => {
  const b = new Brazal({ ataques: [{ tipo: "hold-strike", duracion: 1, retardo: 0.1 }] });
  assert.equal(b.tic(0.016, { pulsado: true }).sube, false, "sin desplegar no hay escudo");
  b.desplegar(true);
  b.tic(0.016, { pulsado: true });
  assert.equal(b.arriba, true);
  b.desplegar(false);
  assert.equal(b.arriba, false);
  assert.equal(b.postura, POSTURA.GUARDADO);
});

test("un objeto sin ataque hold-strike no se levanta", () => {
  const b = new Brazal({ ataques: [{ tipo: "strike-land", duracion: 1, retardo: 0.6 }] });
  b.desplegar(true);
  assert.equal(b.tic(0.016, { pulsado: true }).sube, false);
});

// ── LO QUE DICE LA FICHA DE VERDAD ────────────────────────────────────────

test("los siete escudos del juego se leen con un solo ataque: hold-strike", { skip: !hay }, () => {
  const ids = ["shields_buckler", "shields_wooden", "shields_ironshield",
    "shields_lironshield", "shields_urdual", "shields_rune", "shields_f"];
  for (const id of ids) {
    const f = leerFichaObjeto(SCRIPTS, `items/${id}`);
    assert.equal(f.ataques.length, 1, `${id} registra un ataque`);
    assert.equal(f.arma.tipo, "hold-strike", `${id} es hold-strike`);
    // Y los dos que se tiran son los de `base_melee`, que `[override]
    // weapon_spawn` deja huérfanos.
    assert.equal(f.ataquesFantasma, 2, `${id} tira dos ataques fantasma`);
    assert.ok(f.escudo, `${id} tiene bloque de escudo`);
    assert.equal(f.mano, "left");
    assert.equal(f.manoNumero, 0);
  }
});

test("el escudo de entrenamiento es el más caro de aguante y el aguante es mentira", { skip: !hay }, () => {
  const b = leerFichaObjeto(SCRIPTS, "items/shields_buckler");
  const m = leerFichaObjeto(SCRIPTS, "items/shields_wooden");
  assert.equal(b.escudo.aguanteMuerto, 15);
  assert.equal(m.escudo.aguanteMuerto, 0.5);
  // Pero el ataque registrado pide 0, así que ninguno de los dos se cobra.
  assert.equal(b.arma.aguante, 0);
  assert.equal(m.arma.aguante, 0);
});

test("un escudo no se rompe en Rebirth: su vida está declarada y no se gasta", { skip: !hay }, () => {
  const b = leerFichaObjeto(SCRIPTS, "items/shields_buckler");
  assert.equal(b.escudo.vida, 500);
  assert.equal(b.escudo.vidaMaxima, 500);
  // La regla que la restaba está comentada entera (cinco bloques), así que la
  // vida es un número que nadie mira. Se lee para poder decirlo.
  assert.equal(b.escudo.inmortal, false);
});

test("SHIELD_BASE_PARRY está en los seis escudos y no lo lee nadie", { skip: !hay }, () => {
  const vistos = [];
  for (const id of ["shields_buckler", "shields_wooden", "shields_ironshield",
    "shields_lironshield", "shields_urdual", "shields_rune"]) {
    vistos.push(leerFichaObjeto(SCRIPTS, `items/${id}`).escudo.parryBaseMuerto);
  }
  assert.deepEqual(vistos, [10, 5, 20, 40, 40, 25]);
});

test("los seis vales de tienda NO son escudos", { skip: !hay }, () => {
  const v = leerFichaObjeto(SCRIPTS, "items/item_tk_shields_buckler");
  assert.equal(v.escudo, null);
  assert.equal(v.tipo, "trasto");
});

// ── LOS DOS FALLOS NUESTROS QUE SALIERON CON ESTO ─────────────────────────

test("el lector ya no da a los escudos el ataque fantasma de base_melee", { skip: !hay }, () => {
  // Antes salían TRES ataques y el principal era un `strike-land` de la base que
  // en el juego no existe: `shields_base` anula `weapon_spawn`, y el evento que
  // registraba esos ataques —`register_normal`— se queda sin quien lo llame.
  const f = leerFichaObjeto(SCRIPTS, "items/shields_buckler");
  assert.equal(f.ataques.length, 1);
  // Y el borrado no se pasa de largo: una espada no pierde ninguno.
  const e = leerFichaObjeto(SCRIPTS, "items/swords_rsword");
  assert.equal(e.ataques.length, 2);
  assert.equal(e.ataquesFantasma, 0);
});

test("los puños conservan la patada, que llega por un [override] de register_charge1", { skip: !hay }, () => {
  const p = leerFichaObjeto(SCRIPTS, "items/fist_bare");
  assert.equal(p.ataques.length, 2);
  assert.equal(p.ataquesFantasma, 1, "el cargado de base_melee lo pisa base_kick");
  assert.deepEqual(p.ataques.map((a) => a.teclas.join("+")), ["+attack1", "-attack1"]);
});

test("`wearable` necesita dos parámetros, así que la palabra sola no viste", { skip: !hay }, () => {
  // El motor: `if(Params[0]=="0") clear; else if(Params.size()>=2) set;`. O sea
  // que `wearable` y `wearable 1` no hacen nada. Aquí se leía la palabra sola
  // como un sí, y como los 105 objetos vestibles del juego la escriben con
  // sitio, el campo salía falso en TODOS.
  const b = leerFichaObjeto(SCRIPTS, "items/shields_buckler");
  assert.equal(b.vestible, true);
  assert.deepEqual(b.ranuras, ["bow"]);
  const e = leerFichaObjeto(SCRIPTS, "items/swords_rsword");
  assert.equal(e.vestible, false, "una espada no se lleva puesta");
});
