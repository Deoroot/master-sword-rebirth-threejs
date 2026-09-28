// El servidor: la vida total del grupo, el autoajuste del bicho y la cadena de
// experiencia. Todo lo que hay entre `setvard NPC_GIVE_EXP 25` y lo que el
// jugador se apunta al matarlo.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  PARTIDA, vidaTotal, jugadoresActivos,
  TRAMOS, MULTI_VIDA, MULTI_DANO, ROMANOS,
  nivelDeAjuste, autoajustar, expadj, comoLoEscribe, experienciaDelBicho,
} from "../src/juego/servidor.js";

describe("la partida que ve el motor", () => {
  const tres = [
    { activo: true, vidaMaxima: 100 },
    { activo: true, vidaMaxima: 250 },
    { activo: false, vidaMaxima: 900 },
  ];

  test("suma la vida MÁXIMA de los activos y no cuenta a los que no lo están", () => {
    assert.equal(vidaTotal(tres), 350);
    assert.equal(jugadoresActivos(tres), 2);
  });

  test("con todos inactivos devuelve 1 y no 0 — «dun wanna screw with mob spawns»", () => {
    assert.equal(vidaTotal([{ activo: false, vidaMaxima: 900 }]), 1);
    assert.equal(jugadoresActivos([{ activo: false, vidaMaxima: 900 }]), 1);
  });

  test("con la partida vacía de verdad, cero", () => {
    // No es lo mismo «no hay nadie» que «los hay y los he descartado». El
    // motor sólo pone el 1 en el segundo caso, y por eso lleva la bandera.
    assert.equal(vidaTotal([]), 0);
    assert.equal(jugadoresActivos([]), 0);
  });

  test("los valores FINGIDOS sólo se leen con el central apagado", () => {
    const apagado = { ...PARTIDA, central: false, vidaFalsa: 2500, jugadoresFalsos: 4 };
    const encendido = { ...apagado, central: true };
    assert.equal(vidaTotal(tres, apagado), 2500);
    assert.equal(jugadoresActivos(tres, apagado), 4);
    // Con central, el motor ni los mira: vuelven los de verdad.
    assert.equal(vidaTotal(tres, encendido), 350);
    assert.equal(jugadoresActivos(tres, encendido), 2);
  });

  test("y por eso el central arranca APAGADO", () => {
    // No es una preferencia: es que `ms_fake_hp` y `ms_fake_players` viven
    // dentro del `if (ms_central_enabled == 0)` (util.cpp:867, 899, 935, 972).
    // Encenderlo sin un servidor central detrás no conecta con nada y sí
    // apaga la única forma de medir el escalado.
    assert.equal(PARTIDA.central, false);
    assert.equal(PARTIDA.jugadoresFalsos, 0);
    assert.equal(PARTIDA.vidaFalsa, 0);
  });
});

describe("el autoajuste del monstruo", () => {
  test("los tramos son los del script", () => {
    assert.deepEqual(TRAMOS, [0, 500, 1000, 2000, 3000, 5000]);
    assert.deepEqual(MULTI_VIDA, [1, 2, 3, 3.5, 4, 5]);
    assert.deepEqual(MULTI_DANO, [1, 2, 3, 3.5, 4, 5]);
    assert.deepEqual(ROMANOS, ["", " II", " III", " IV", " V", " VI"]);
  });

  test("el corte es `>` estricto: 500 justos siguen siendo nivel 0", () => {
    assert.equal(nivelDeAjuste(499), 0);
    assert.equal(nivelDeAjuste(500), 0);
    assert.equal(nivelDeAjuste(501), 1);
    assert.equal(nivelDeAjuste(5000), 4);
    assert.equal(nivelDeAjuste(5001), 5);
    assert.equal(nivelDeAjuste(99999), 5);
  });

  test("`NPC_ADJ_DOWN` baja el nivel y nunca por debajo de 0", () => {
    assert.equal(nivelDeAjuste(5001, { baja: 2 }), 3);
    assert.equal(nivelDeAjuste(600, { baja: 5 }), 0);
  });

  test("sin `set_self_adj` no pasa nada, por alta que sea la vida del grupo", () => {
    const r = autoajustar({ vidaTotalDelGrupo: 99999, seAjusta: false });
    assert.deepEqual(r, { nivel: 0, multiVida: 1, multiDano: 1, sufijo: "" });
  });

  test("con multiplicador propio de 1 el resultado es el número del tramo", () => {
    const r = autoajustar({ vidaTotalDelGrupo: 1200, seAjusta: true });
    assert.equal(r.nivel, 2);
    assert.equal(r.multiVida, 3);
    assert.equal(r.multiDano, 3);
    assert.equal(r.sufijo, " III");
  });

  test("pero con multiplicador propio SUMA, que no es lo mismo que multiplicar", () => {
    // `if ( NPC_HP_MULTI == 1 ) subtract ADD_NPC_HP_MULTI 1` — el descuento de
    // uno sólo cae si el bicho no traía multiplicador. A un ×2 del mapa, el
    // tramo 2 le deja en 2 + 3 = 5. Multiplicando serían 6; el número del
    // tramo, 3. Ninguno de los dos es el del juego.
    const r = autoajustar({ vidaTotalDelGrupo: 1200, seAjusta: true, multiVida: 2, multiDano: 2 });
    assert.equal(r.multiVida, 5);
    assert.equal(r.multiDano, 5);
  });
});

describe("expadj y el punto decimal", () => {
  test("con punto MULTIPLICA, sin punto SUMA — y lo decide el texto", () => {
    assert.equal(expadj(25, "2.0"), 50);
    assert.equal(expadj(25, "2"), 27);
    // El mismo valor, dos resultados. No hay forma de saberlo desde el número.
    assert.notEqual(expadj(25, "2.0"), expadj(25, "2"));
  });

  test("con `scale` suma un ratio del ORIGINAL, no del actual", () => {
    // «eg. 10XP mob 1.0 scale = 20XP, the first time, 30 the next»
    assert.equal(expadj(10, "1.0", { original: 10 }), 20);
    assert.equal(expadj(20, "1.0", { original: 10 }), 30);
  });

  test("el motor escribe los números con `%.2f`, así que siempre llevan punto", () => {
    assert.equal(comoLoEscribe(4), "4.00");
    assert.equal(comoLoEscribe(1.5), "1.50");
    // Y ésa es la mitad que falta de la errata: en cuanto un `add` toca la
    // variable, «1» pasa a ser «2.50» y `expadj` cambia de sumar a multiplicar
    // sin que nadie escriba el cambio en ningún sitio.
    assert.ok(comoLoEscribe(4).includes("."));
  });
});

describe("la experiencia que reparte un bicho", () => {
  test("el goblin de Gate City no vale 25: vale 26", () => {
    // `setvard NPC_ALL_XP_ADJ 1` y luego `expadj NPC_ALL_XP_ADJ noscale`. La
    // línea quería decir «multiplica por uno», pero «1» no lleva punto, así
    // que SUMA uno. Le pasa a todos los monstruos del juego que no llevan
    // multiplicadores. Se porta con la errata.
    assert.equal(experienciaDelBicho({ base: 25 }).exp, 26);
    assert.equal(experienciaDelBicho({ base: 12 }).exp, 13);   // araña
    assert.equal(experienciaDelBicho({ base: 200 }).exp, 201); // zombi arquero
  });

  test("un bicho que no da experiencia sigue sin darla", () => {
    // `if NPC_GIVE_EXP > 0` corta antes del `expadj`. Si no, los tenderos y el
    // cofre del tesoro valdrían un punto cada uno.
    assert.equal(experienciaDelBicho({ base: 0 }).exp, 0);
    assert.equal(experienciaDelBicho({ base: 0 }).pasos.length, 0);
  });

  test("los multiplicadores aportan +50 % por cada 100 %… más un uno de regalo", () => {
    // `subtract L_ADJ 1 ; multiply L_ADJ 0.5 ; add L_ADJ 1` — el `add 1` del
    // final no debería estar, y hace que un ×2 aporte 1,5 en vez de 0,5.
    // Con ×3 de vida y ×3 de daño el ajuste sale 1 + 2 + 2 = 5.
    assert.equal(experienciaDelBicho({ base: 25, multiVida: 3, multiDano: 3 }).exp, 125);
    // Y ahora el ajuste lleva decimales, así que multiplica de verdad: el +1
    // de la errata anterior desaparece en cuanto hay multiplicadores.
    assert.notEqual(experienciaDelBicho({ base: 25, multiVida: 3, multiDano: 3 }).exp, 126);
  });

  test("el multiplicador propio está topado en 5", () => {
    const a = experienciaDelBicho({ base: 10, multiDano: 5 }).exp;
    const b = experienciaDelBicho({ base: 10, multiDano: 50 }).exp;
    assert.equal(a, b);
  });

  test("con el central apagado no hay nada de FuzzNet", () => {
    const r = experienciaDelBicho({ base: 25, jugadores: 8, esJefe: true });
    assert.equal(r.exp, 26);
    assert.equal(r.pasos.length, 1);
  });

  test("encender el central TRIPLICA la experiencia con un solo jugador", () => {
    // 26 × 2 (FN) × 1,5 (el ajuste por jugadores, que con uno ya vale 1,5 por
    // la errata del `if` de una línea) = 78. Es la razón de que el central
    // arranque apagado: no conecta con nada y sí cambia toda la curva.
    const srv = { ...PARTIDA, central: true };
    assert.equal(experienciaDelBicho({ base: 25, jugadores: 1, srv }).exp, 78);
  });

  test("y el ajuste por jugadores es el mismo con uno que con dos", () => {
    // ```
    // if ( L_N_PLAYER_ADJ > 1 )
    // subtract L_N_PLAYER_ADJ 1      <- sólo esta línea cae bajo el `if`
    // multiply L_N_PLAYER_ADJ 0.5
    // add L_N_PLAYER_ADJ 1
    // ```
    // Con 1: 1 × 0,5 + 1 = 1,5. Con 2: (2−1) × 0,5 + 1 = 1,5. Con 3: 2.
    const srv = { ...PARTIDA, central: true };
    const con = (n) => experienciaDelBicho({ base: 25, jugadores: n, srv }).exp;
    assert.equal(con(1), con(2));
    assert.equal(con(3), 104);   // 26 × 2 × 2
  });

  test("el jefe cobra su ×4 antes del reparto por jugadores", () => {
    const srv = { ...PARTIDA, central: true };
    assert.equal(experienciaDelBicho({ base: 25, esJefe: true, jugadores: 1, srv }).exp, 312);
  });

  test("el multiplicador global del mapa entra antes que FuzzNet", () => {
    // Va como texto: «2.0» multiplica. Escrito «2» sumaría dos, que es la
    // trampa de siempre y por eso `PARTIDA.multiplicadorGlobal` no es un
    // número.
    assert.equal(experienciaDelBicho({ base: 25, srv: { ...PARTIDA, multiplicadorGlobal: "2.0" } }).exp, 52);
    assert.equal(experienciaDelBicho({ base: 25, srv: { ...PARTIDA, multiplicadorGlobal: "2" } }).exp, 28);
    // Y puesto a uno no se aplica, ni sumando ni multiplicando.
    assert.equal(experienciaDelBicho({ base: 25, srv: { ...PARTIDA, multiplicadorGlobal: "1" } }).exp, 26);
  });

  test("la experiencia nunca baja de cero", () => {
    assert.equal(experienciaDelBicho({ base: 10, reduccion: "-100" }).exp, 0);
  });
});
