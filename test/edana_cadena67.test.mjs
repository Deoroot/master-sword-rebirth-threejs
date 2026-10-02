// LA CADENA QUE ENCIENDE UN MAPA DE MASTER SWORD — el 67.
//
// Cuatro piezas que existían por separado y no estaban unidas, y el síntoma de
// las cuatro era el mismo: **la taberna de Edana vacía**, sin un solo error.
//
//   1. `game.serverside` no se resolvía          -> `atoi("game.serverside")` = 0
//   2. `usetrigger` no estaba en el lenguaje     -> el guion no llegaba al `.bsp`
//   3. `SF_MULTIMAN_THREAD` se extraía y no se usaba -> un ciclo y para
//   4. `ms_counter` no tenía clase en el bus     -> el disparo se contaba y nada
//
// El primero es el que más cuesta ver, y por eso tiene su prueba propia:
// `if game.serverside` es el **`if` VIEJO**, sin paréntesis, y ése no salta una
// línea — **abandona el bloque entero** (`script.cpp:5754-5758`). En
// `game_player_putinworld` está en el comando 3 de 20 y el
// `callevent 1.0 activate_stuff` en el 17. Medido sobre los 2 884 scripts hay
// **280 `if game.serverside`** y **16 `if game.clientside`** sin paréntesis.
//
// Las pruebas van sobre un caso mínimo escrito aquí y además sobre el mapa de
// verdad, porque son las dos cosas que hacen falta: el caso mínimo puede tener
// las dos versiones al lado, y el mapa es el único que dice si la cadena real
// llega hasta el final.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { Guion, entornoVacio, partirGuion } from "../src/play/guion.js";
import { Disparadores, USO, SF } from "../src/play/disparadores.js";

const malla = () => {
  const r = "build/edana/malla.json";
  return existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
};

/**
 * EL GUION SE PARTE CON `partirGuion`, NO SE ESCRIBE A MANO.
 *
 * La primera versión de estas pruebas construía los comandos como objetos
 * —`{ nombre: "if", params: ["game.serverside"] }`— y con la guarda FALSA el
 * `usetrigger` de después corría igual: las dos pruebas se pusieron rojas con el
 * código bien. La razón es que lo que distingue el `if` VIEJO del NUEVO no es el
 * nombre sino una bandera que pone el ANALIZADOR al ver el paréntesis
 * (`script.cpp:5310-5322`), y un objeto escrito a mano no la trae.
 *
 * Es la variante del 59 —la prueba construye el argumento que el llamador se
 * equivoca al pasar— y aquí habría dejado sin comprobar justo el mecanismo que
 * tenía el fallo. Con el texto de verdad, el camino es el del juego.
 */
const deTexto = (texto) => {
  const { eventos, preload } = partirGuion(texto);
  const disparos = [];
  const g = new Guion({
    eventos, preload, nombre: "prueba",
    entorno: { ...entornoVacio(), usarDisparador: (n) => disparos.push(n) },
  });
  return { g, disparos };
};

describe("`game.serverside` y el `if` viejo (67)", () => {
  // El caso mínimo tiene el `if` viejo EN MEDIO, igual que el guion del jugador:
  // un comando antes, la guarda, y el que importa después. Con la guarda falsa el
  // de después no corre, y `ANTES` es lo que separa «la guarda falló» de «el
  // evento no corrió».
  const guionCon = (guarda) => {
    const { g, disparos } = deTexto(`{ entra
  setvard ANTES 1
  if ${guarda}
  usetrigger player_joined
}`);
    g.llamar("entra", []);
    return { disparos, antes: g.buscarVar("ANTES")?.valor };
  };

  test("`game.serverside` vale 1: este puerto es el lado servidor", () => {
    const r = guionCon("game.serverside");
    assert.deepEqual(r.disparos, ["player_joined"]);
    assert.equal(r.antes, "1");
  });

  test("`game.clientside` vale 0, y el `if` viejo abandona el bloque", () => {
    const r = guionCon("game.clientside");
    assert.deepEqual(r.disparos, [], "con la guarda falsa no se llega al usetrigger");
    assert.equal(r.antes, "1", "pero lo de ANTES de la guarda sí corrió");
  });

  test("una variable que no existe sigue devolviendo su propio nombre", () => {
    // `script.cpp:4741`. Es el comportamiento correcto y es justo el que hacía
    // que `game.serverside` valiera 0: la corrección es resolverlo, no cambiar
    // lo que pasa con las variables inexistentes.
    assert.deepEqual(guionCon("NO_EXISTO").disparos, []);
  });

  test("y con PARÉNTESIS es el `if` NUEVO: sólo se salta su hijo", () => {
    // El segundo caso, que es lo que hace que la prueba de arriba discrimine:
    // de los 296 de este tipo que hay en el mod, 68 llevan paréntesis y ésos
    // nunca abandonaron nada. Si el puerto tratara los dos igual, una de las dos
    // pruebas fallaría.
    const { g, disparos } = deTexto(`{ entra
  if ( game.clientside )
  usetrigger no_deberia
  usetrigger si_deberia
}`);
    g.llamar("entra", []);
    assert.deepEqual(disparos, ["si_deberia"]);
  });
});

describe("`usetrigger` (67)", () => {
  const corre = (params) => {
    const disparos = [];
    const g = new Guion({
      nombre: "prueba",
      entorno: { ...entornoVacio(), usarDisparador: (n) => disparos.push(n) },
      eventos: [{ nombre: "x", cmds: [{ nombre: "usetrigger", params, hijos: [] }] }],
    });
    g.llamar("x", []);
    return disparos;
  };

  test("acepta VARIOS nombres y los dispara en orden", () => {
    // `for(int i = 0; i < Params.size(); i++) FireTargets(Params[i], …)`
    //                                            scriptcmds.cpp:7057-7058
    assert.deepEqual(corre(["a", "b", "c"]), ["a", "b", "c"]);
  });

  test("sin parámetros no hace nada: `ERROR_MISSING_PARMS`", () => {
    assert.deepEqual(corre([]), []);
  });
});

describe("el `multi_manager` con `SF_MULTIMAN_THREAD` (67)", () => {
  /** Un manager con la bandera y un relé que le vuelve a disparar: el bucle. */
  const bucle = (banderas) => [
    { clase: "multi_manager", nombre: "mm", banderas, objetivos: [{ nombre: "efecto", retraso: 0 }, { nombre: "vuelta", retraso: 1 }] },
    { clase: "trigger_relay", nombre: "vuelta", objetivo: "mm", banderas: 0, uso: USO.ENCENDER, probabilidad: 100 },
    { clase: "trigger_relay", nombre: "efecto", objetivo: null, banderas: 0, uso: USO.ENCENDER, probabilidad: 100 },
  ];
  const correr = (banderas, segundos = 10) => {
    let t = 0;
    const bus = new Disparadores(bucle(banderas), { reloj: () => t, azar: () => 0.5 });
    bus.disparar("mm", null, USO.ALTERNAR, 0, null);
    for (let i = 0; i < segundos * 10; i++) { t += 0.1; bus.paso(); }
    return { ciclos: bus.cuenta.get("mm") ?? 0, efectos: bus.cuenta.get("efecto") ?? 0, n: bus.n };
  };

  test("la bandera es el bit 1, y con ella el bucle da muchas vueltas", () => {
    assert.equal(SF.MANAGER_HILO, 1);
    const r = correr(SF.MANAGER_HILO);
    // Un ciclo por segundo. Se pide «más de 5» y no «más de 1» para que el
    // control no pueda pasar por accidente con un solo rebote.
    assert.ok(r.ciclos > 5, `${r.ciclos} ciclos`);
    assert.equal(r.efectos, r.ciclos, "cada vuelta dispara su efecto");
  });

  test("y SIN la bandera se para en UNO: el original se rechaza a sí mismo", () => {
    // Es el segundo caso que hace que la prueba de arriba discrimine. El motor
    // hace lo mismo: `ManagerThink` dispara el relé y **luego** vuelve a
    // habilitar su `Use` (`triggers.cpp:432-441`), así que la vuelta llega con
    // el `Use` todavía desactivado.
    const r = correr(0);
    // Se mira `efectos` y NO `ciclos`: `cuenta` del bus cuenta **intentos** de
    // disparo, y sin clonar el relé de la vuelta sigue intentándolo y el manager
    // lo rechaza. La primera versión pedía `ciclos === 1` y leía 2. El efecto
    // sólo se dispara si el manager corrió.
    assert.equal(r.efectos, 1, "corre una vez y no vuelve");
    assert.ok(r.ciclos > 1, "aunque se le siga INTENTANDO disparar");
  });

  test("los clones se reutilizan: la lista de entidades no crece sin tope", () => {
    // El motor hace `UTIL_Remove` y se olvida; aquí la lista es fija, y un
    // `multi_manager` disparado cada segundo durante una partida larga la haría
    // crecer para siempre. Con 60 s de bucle no puede haber 60 clones.
    const r = correr(SF.MANAGER_HILO, 60);
    assert.ok(r.ciclos > 50, `${r.ciclos} ciclos`);
    assert.ok(r.n <= 3 + 3, `${r.n} entidades tras ${r.ciclos} ciclos`);
  });
});

describe("`ms_counter` (67)", () => {
  const bus8 = () => new Disparadores([
    { clase: "ms_counter", nombre: "c", objetivo: "fin", cuenta: 8, banderas: 0 },
    { clase: "trigger_relay", nombre: "fin", objetivo: null, banderas: 0, uso: USO.ENCENDER, probabilidad: 100 },
  ], { reloj: () => 0, azar: () => 0.5 });

  test("cuenta hacia atrás y sólo dispara al llegar a CERO", () => {
    const bus = bus8();
    for (let i = 0; i < 7; i++) bus.disparar("c", null, USO.ALTERNAR, 0, null);
    assert.equal(bus.cuenta.get("fin") ?? 0, 0, "con siete de ocho todavía no");
    bus.disparar("c", null, USO.ALTERNAR, 0, null);
    assert.equal(bus.cuenta.get("fin") ?? 0, 1, "y con el octavo sí");
  });

  test("y se BORRA al agotarse: `m_flWait = -1` -> `SUB_Remove`", () => {
    const bus = bus8();
    for (let i = 0; i < 8; i++) bus.disparar("c", null, USO.ALTERNAR, 0, null);
    assert.equal(bus.porNombre("c").length, 0, "ya no está vivo");
    // Y disparar a un contador muerto no vuelve a disparar el final.
    bus.disparar("c", null, USO.ALTERNAR, 0, null);
    assert.equal(bus.cuenta.get("fin"), 1);
  });

  test("cada disparo se anota, para poder medir la cuenta desde fuera", () => {
    const bus = bus8();
    bus.disparar("c", null, USO.ALTERNAR, 0, null);
    const s = bus.recoger().find((x) => x.tipo === "cuentaAtras");
    assert.equal(s.quedan, 7);
  });
});

describe("y la cadena de Edana, sobre el mapa de verdad (67)", () => {
  test("`player_joined` da OCHO ciclos y agota el contador", (t) => {
    const m = malla();
    if (!m) return t.skip("no está build/edana/malla.json");
    let tiempo = 0;
    const bus = new Disparadores(m.disparadores, { reloj: () => tiempo, azar: Math.random });
    bus.disparar("player_joined", { nombre: "jugador" }, USO.ALTERNAR, 0, null);
    for (let i = 0; i < 1200; i++) { tiempo += 0.1; bus.paso(); }
    // El `count 8` del `patroncounter` es lo que fija el ocho, y sale del mapa:
    // no se escribe aquí, se lee.
    const cuenta = m.disparadores.find((e) => e.clase === "ms_counter")?.cuenta;
    assert.equal(bus.cuenta.get("patronmm1"), cuenta);
    assert.equal(bus.cuenta.get("patronkiller"), 1);
    assert.equal(bus.porNombre("patroncounter").length, 0, "el contador se ha borrado");
  });

  test("y ninguna clase de la cadena cae en «no sé hacer eso»", (t) => {
    const m = malla();
    if (!m) return t.skip("no está build/edana/malla.json");
    let tiempo = 0;
    const bus = new Disparadores(m.disparadores, { reloj: () => tiempo, azar: Math.random });
    const salidas = [];
    bus.disparar("player_joined", { nombre: "jugador" }, USO.ALTERNAR, 0, null);
    salidas.push(...bus.recoger());
    for (let i = 0; i < 300; i++) { tiempo += 0.1; bus.paso(); salidas.push(...bus.recoger()); }
    // `tipo: "usar"` es el cajón de «esto lo resuelve el mundo o nadie». Que la
    // cadena de la taberna no meta nada ahí es lo que dice que está entera.
    const sinHacer = [...new Set(salidas.filter((s) => s.tipo === "usar").map((s) => s.clase))];
    assert.deepEqual(sinHacer, [], sinHacer.join(", "));
  });
});
