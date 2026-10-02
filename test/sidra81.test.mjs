// EXPERIMENTO 81 — LA MISIÓN DE LA SIDRA, Y LOS CUATRO HUECOS QUE LA TAPABAN
//
// La misión de la sidra de Edana (`cider` → Bryan → Sylphiel → Krythos) no se
// podía empezar, y cuando se fue a ver por qué no había un motivo: había
// cuatro, apilados. Estas pruebas fijan los cuatro, y la última recorre la
// cadena entera contra los guiones de verdad.
//
// ── Por qué las del analizador le dan TEXTO ──────────────────────────────
// Lo que distingue un bloque nombrado de uno anónimo lo decide `partirGuion`
// leyendo líneas, no un objeto. Escribir `{ nombre: "say_hi", cmds: [] }` a
// mano probaría que `llamar` sabe buscar por nombre —que ya se sabía— y
// dejaría sin comprobar justo el mecanismo que fallaba. Es la variante del 67.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { partirGuion, GETTERS } from "../src/play/guion.js";
import { entornoDe } from "../src/play/npcguion.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const EDANA = "build/edana";

describe("`eventname`: la forma LARGA de nombrar un bloque (script.cpp:5370-5376)", () => {
  test("nombra el bloque aunque venga sangrado, que es como viene SIEMPRE", () => {
    const { eventos } = partirGuion("{\n   eventname say_hi\n\n   saytext hola\n}\n");
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].nombre, "say_hi");
  });

  test("EL FALLO: sin recortar la línea, el bloque se quedaba anónimo", () => {
    // El control negativo de arriba. Lo que medía el fallo es que un bloque
    // sangrado saliera con `nombre` vacío; aquí se fija que ya no pasa, y la
    // forma pegada al margen —que no existe en el juego— sigue funcionando.
    const { eventos } = partirGuion("{\neventname say_hi\n}\n");
    assert.equal(eventos[0].nombre, "say_hi");
  });

  test("el comando NO se queda en la lista: el motor no pone `KeepCmd`", () => {
    // Tres líneas más abajo, `repeatdelay` sí lo pone. Por eso `eventname`
    // aparecía 570 veces en «no soportados» y `repeatdelay` no.
    const { eventos } = partirGuion("{\n   eventname say_hi\n   saytext hola\n}\n");
    assert.deepEqual(eventos[0].cmds.map((c) => c.nombre), ["saytext"]);
  });

  test("un bloque SIN nombre sigue marcado como cabecera, y uno con `eventname` no", () => {
    // Esto es lo que decide si corre al nacer: `GuionDeNpc` llama a `""`.
    const anon = partirGuion("{\n   setvar A 1\n}\n").eventos[0];
    const conNombre = partirGuion("{\n   eventname game_fall\n   setvar A 1\n}\n").eventos[0];
    assert.equal(anon.nombre, "");
    assert.equal(anon.cabecera, true);
    assert.equal(conNombre.nombre, "game_fall");
    assert.equal(conNombre.cabecera, undefined);
  });

  test("`sscanf(\"%s\")`: se queda con la primera palabra y tira el resto", () => {
    const { eventos } = partirGuion("{\n   eventname say_hi sobra esto\n}\n");
    assert.equal(eventos[0].nombre, "say_hi");
  });
});

describe("EL CENSO, que se cuenta y no se escribe", () => {
  // La regla del 50: con un solo caso, el valor correcto y el de reposo son el
  // mismo. Aquí el segundo caso son los 2 884 guiones del juego.
  const todos = [];
  const andar = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) andar(p);
      else if (e.endsWith(".script")) todos.push(p);
    }
  };
  andar(SCRIPTS);

  test("hay guiones que leer (si no, lo de abajo no mide nada)", () => {
    assert.ok(todos.length > 2000, `sólo ${todos.length} guiones`);
  });

  test("TODAS las declaraciones `eventname` del juego vienen sangradas", () => {
    // Éste es el dato que explica por qué el fallo era total y no parcial: no
    // es que fallaran «muchas», es que no acertaba NINGUNA.
    let sangradas = 0, alMargen = 0;
    const ficheros = new Set();
    for (const p of todos) {
      for (const ln of readFileSync(p, "latin1").split(/\r?\n/)) {
        if (/^eventname\s+\S/i.test(ln)) alMargen++;
        else if (/^\s+eventname\s+\S/i.test(ln)) { sangradas++; ficheros.add(p); }
      }
    }
    assert.equal(alMargen, 0, "si aparece una al margen, el fallo habría sido parcial");
    assert.ok(sangradas > 500, `sólo ${sangradas} sangradas`);
    assert.ok(ficheros.size > 150, `sólo ${ficheros.size} ficheros`);
  });

  test("y el analizador las nombra todas: cero bloques anónimos con `eventname`", () => {
    let anonimosConEventname = 0;
    for (const p of todos.slice(0, 400)) {
      for (const e of partirGuion(readFileSync(p, "latin1")).eventos) {
        if (e.nombre) continue;
        if (e.cmds.some((c) => c.nombre === "eventname")) anonimosConEventname++;
      }
    }
    assert.equal(anonimosConEventname, 0);
  });
});

describe("`$cansee(<objetivo>,<rango>)` — npcscript.cpp:1754-1850", () => {
  // `unidadesPorMetro: 1` para que los números de abajo SEAN unidades del
  // motor, que es en lo que están escritos los rangos de los guiones. La
  // conversión de verdad tiene su propia prueba al final: si se mezclaran,
  // ninguna de las dos diría cuál de las dos reglas se rompió.
  const monta = ({ rayo = () => true, dondeJugador = "0 0 0", dondeNpc = "0 0 0", vida = 100, upm = 1 } = {}) => {
    const apuntes = [];
    const e = entornoDe({
      npc: { nombre: "Npc", script: "x", origen: dondeNpc },
      jugador: { ref: "p1", personaje: { nombre: "Yo", vida }, origen: dondeJugador },
      lineaDeVision: rayo,
      unidadesPorMetro: upm,
      apuntar: (tipo, nombre) => apuntes.push({ tipo, nombre }),
    });
    return { e, apuntes };
  };

  test("está en GETTERS (si no, el `if` VIEJO abandona el bloque entero)", () => {
    assert.ok(GETTERS.has("$cansee"));
  });

  test("dentro del rango ve, fuera no", () => {
    const { e } = monta({ dondeJugador: "100 0 0" });
    assert.equal(e.ve("player", "128"), "1");
    assert.equal(e.ve("player", "99"), "0");
  });

  test("el límite es `<` ESTRICTO, no `<=`", () => {
    const { e } = monta({ dondeJugador: "100 0 0" });
    assert.equal(e.ve("player", "100"), "0");
    assert.equal(e.ve("player", "100.0001"), "1");
  });

  test("SIN rango no hay límite: `ClosestTarget` vale -1 (:1761, :1841)", () => {
    const { e } = monta({ dondeJugador: "99999 0 0" });
    assert.equal(e.ve("player"), "1");
    assert.equal(e.ve("player", ""), "1");
  });

  test("el rango pasa por `atof` y no por `Number` — la del 79", () => {
    const { e } = monta({ dondeJugador: "100 0 0" });
    // `atof("128abc")` es 128; `Number("128abc")` es NaN, y `100 < NaN` es
    // `false`, o sea que con `Number` este NPC se quedaría ciego.
    assert.equal(e.ve("player", "128abc"), "1");
    // Y `atof` de algo que no empieza por número es CERO, no NaN: ciego.
    assert.equal(e.ve("player", "cerca"), "0");
  });

  test("la distancia es 3D, no 2D: el motor se molesta en escribirlo (:1829)", () => {
    // Con sólo el plano, (100, 0, 100) estaría a 100 y pasaría un rango de 128.
    // En 3D son 141,4 y no pasa. Si esto se pusiera verde con un `Length2D`,
    // la prueba no mediría nada: por eso los números son los que distinguen.
    const { e } = monta({ dondeJugador: "100 0 100" });
    assert.equal(e.ve("player", "128"), "0");
    assert.equal(e.ve("player", "142"), "1");
  });

  test("sin rayo NO se finge que se ve: da «0» y lo apunta", () => {
    const { e, apuntes } = monta({ rayo: null });
    assert.equal(e.ve("player", "128"), "0");
    assert.ok(apuntes.some((a) => String(a.nombre).includes("sin rayo")));
  });

  test("el rayo manda: con pared en medio no ve, por cerca que esté", () => {
    const { e } = monta({ rayo: () => false, dondeJugador: "1 0 0" });
    assert.equal(e.ve("player", "128"), "0");
  });

  test("un muerto no se ve — «deadflag != DEAD_NO» (:1792)", () => {
    const { e } = monta({ vida: 0 });
    assert.equal(e.ve("player", "128"), "0");
  });

  test("CON rango, un sitio ilegible no se cuela — la del 79", () => {
    const { e, apuntes } = monta({ dondeJugador: "esto no es un vector" });
    assert.equal(e.ve("player", "128"), "0");
    assert.ok(apuntes.some((a) => String(a.nombre).includes("sin sitios")));
  });

  test("SIN rango, en cambio, SÍ ve: la posición no se llega a leer", () => {
    // ── LA PRUEBA ESTABA MAL Y EL CÓDIGO BIEN ────────────────────────────
    // Escribí que un sitio ilegible tenía que dar «0» también sin rango, «por
    // simetría». No lo es: con `ClosestTarget = -1` el motor corta en
    // `ClosestTarget < 0 ||` (:1841) ANTES de comparar, o sea que **sin rango
    // la visibilidad la decide el rayo y nada más** y la distancia no se mira.
    // Un sitio que no se puede leer es irrelevante ahí. Pedir «0» habría sido
    // portar una prudencia mía y no la regla del motor.
    const { e } = monta({ dondeJugador: "esto no es un vector" });
    assert.equal(e.ve("player"), "1");
    // Y con el rayo diciendo que no, «0»: o sea que el que manda es el rayo.
    const otro = monta({ rayo: () => false, dondeJugador: "esto no es un vector" });
    assert.equal(otro.e.ve("player"), "0");
  });

  test("LAS POSICIONES SON METROS Y EL RANGO SON UNIDADES", () => {
    // Este puerto guarda los sitios en metros y los guiones escriben los
    // rangos en unidades del motor (`RANGO_LOCAL = 300`, chat.js:131). Sin
    // convertir, `$cansee(player,128)` diría que sí a 128 METROS: tres veces
    // Edana entera, o sea un alcance infinito y callado — la forma del 79.
    // A 39,37 u/m, 4 m son 157,5 unidades: fuera de 128 y dentro de 200.
    const { e } = monta({ dondeJugador: "4 0 0", upm: 39.37 });
    assert.equal(e.ve("player", "128"), "0");
    assert.equal(e.ve("player", "200"), "1");
    // Y el control que lo separa de «mide en metros»: con la escala a 1 los
    // mismos 4 pasarían de sobra los 128.
    const enMetros = monta({ dondeJugador: "4 0 0", upm: 1 });
    assert.equal(enMetros.e.ve("player", "128"), "1");
  });

  test("deja el rastro `ENT_LASTSEEN` al ver, y no al no ver (:1843)", () => {
    const { e } = monta({ dondeJugador: "100 0 0" });
    assert.equal(e.ultimoVisto, undefined);
    e.ve("player", "99");
    assert.equal(e.ultimoVisto, undefined, "no vio: no debe dejar rastro");
    e.ve("player", "128");
    assert.equal(e.ultimoVisto, "p1");
  });
});

describe("`game_postspawn` y sus cuatro parámetros (msmonsterserver.cpp:284-290)", () => {
  // Edana tiene CERO criaturas con `params`, así que un control sobre un
  // vecino de Edana saldría verde sin disparar nada —la trampa del 62—. Por
  // eso esto se mide con un guion escrito aquí, que es el segundo caso.
  const guionDePrueba = `{
   eventname game_postspawn
   setvar VISTO_TITULO PARAM1
   setvar VISTO_DMG PARAM2
   setvar VISTO_HP PARAM3
   setvar VISTO_PARAMS PARAM4
}
`;
  const monta = async (nacer) => {
    const { GuionDeNpc } = await import("../src/play/npcguion.js");
    const ficha = partirGuion(guionDePrueba);
    const g = new GuionDeNpc({ ficha, npc: { nombre: "N", script: "x", origen: "0 0 0" }, nacer });
    return (k) => g.guion.variables?.get?.(k) ?? g.guion.vars?.get?.(k) ?? null;
  };

  test("llega, y en el ORDEN del motor: título, daño, vida, params", async () => {
    const v = await monta({ titulo: "Boss", dmgmulti: "2.00", hpmulti: "3.00", params: "set_fade_in;set_ammo" });
    assert.equal(v("VISTO_TITULO"), "Boss");
    assert.equal(v("VISTO_DMG"), "2.00");
    assert.equal(v("VISTO_HP"), "3.00");
    assert.equal(v("VISTO_PARAMS"), "set_fade_in;set_ammo");
  });

  test("los `;` van CRUDOS: trocear es del guion y su regla vive allí", async () => {
    const v = await monta({ titulo: "d", dmgmulti: "1.00", hpmulti: "1.00", params: "a;1;b" });
    assert.equal(v("VISTO_PARAMS"), "a;1;b");
  });

  test("los valores de reposo son los del motor, y son CADENAS concretas", async () => {
    // `""` o `null` no valen: el guion pregunta `if ( PARAM4 isnot 'none' )`
    // (base_self_adjust.script:45), y con `""` esa condición es CIERTA y
    // entrarían al reparto las 6 880 criaturas del juego con la lista vacía.
    const v = await monta(null);
    assert.equal(v("VISTO_TITULO"), "default");
    assert.equal(v("VISTO_PARAMS"), "none");
    // Y con dos decimales, que es el `UTIL_VarArgs("%.2f", a)` de
    // sharedutil.h:49: el guion lee «1.00» y no «1».
    assert.equal(v("VISTO_DMG"), "1.00");
    assert.equal(v("VISTO_HP"), "1.00");
  });
});

describe("LA CADENA DE LA SIDRA, contra los guiones de verdad", () => {
  const hay = existsSync(`${EDANA}/guiones.json`) && existsSync(`${EDANA}/bichos.json`);

  const montar = () => {
    const guiones = JSON.parse(readFileSync(`${EDANA}/guiones.json`, "utf8"));
    const bichos = JSON.parse(readFileSync(`${EDANA}/bichos.json`, "utf8"));
    const instancias = bichos.colocados.map((c, n) => ({
      id: `n${n}`, ficha: c, donde: [0, 0, 0], muerto: false, dormido: false, sinIa: false, vida: c.hp,
    }));
    const personaje = { id: "p1", nombre: "Tester", oro: 0, vida: 100 };
    const i = new InteraccionesNpc({
      sesion: { personaje }, guiones, areas: [],
      npcPorId: (id) => instancias.find((x) => x.id === id) ?? null,
      suceso: () => {},
      losNpc: () => instancias,
      dondeEstaElJugador: () => [0, 0, 0],
      lineaDeVision: () => true,
    });
    const de = (n) => {
      const inst = instancias.find((x) => i.nombreUnicoDe(x) === n);
      if (!inst) return null;
      const g = i.guionDe(inst);
      if (g) g.jugador = { ref: "p1", personaje, origen: "0 0 0" };
      return g;
    };
    return { i, de, personaje };
  };
  const vale = (g, k) => g.guion.variables?.get?.(k) ?? g.guion.vars?.get?.(k) ?? null;

  test("el horneado está (si no, las de abajo no miden nada)", { skip: !hay }, () => {
    const b = JSON.parse(readFileSync(`${EDANA}/bichos.json`, "utf8"));
    assert.ok(b.colocados.length > 40, `sólo ${b.colocados.length} colocados`);
  });

  test("los NPC entran en el registro de nombres: `$get_by_name` resuelve", { skip: !hay }, () => {
    const { i } = montar();
    assert.ok(i.ponerNombresDeNpc() > 0);
    for (const n of ["bryan", "wench", "krythos"]) {
      assert.ok(i.entidades.porNombre(n), `no resuelve ${n}`);
    }
    // Control negativo: un nombre que no existe sigue sin resolver, que es lo
    // que hace el motor en un mapa donde ese nombre no está.
    assert.equal(i.entidades.porNombre("qwrtypz"), null);
  });

  test("`name_unique` se lee de CUALQUIER bloque, no sólo de `npc_spawn`", { skip: !hay }, () => {
    // El primer intento filtraba por `npc_spawn` y encontraba 2 de 48: en el
    // juego el `name_unique` vive en trece bloques distintos. Aquí hay al
    // menos tres formas entre los 27 guiones de Edana.
    const { i } = montar();
    assert.ok(i.ponerNombresDeNpc() >= 6, "menos nombres de los que Edana tiene");
  });

  test("PASO 1: Sylphiel manda el recado y a Bryan le llega", { skip: !hay }, () => {
    const { de } = montar();
    const w = de("wench"), b = de("bryan");
    assert.ok(w && b);
    assert.equal(vale(b, "CIDER"), "0", "el estado de partida, que antes venía adelantado");
    w.guion.llamar("say_job", []);
    assert.equal(vale(b, "CIDER"), "1", "el `callexternal` entre dos NPC no llegó");
  });

  test("PASO 2: Bryan contesta y avisa a Sylphiel", { skip: !hay }, () => {
    const { de } = montar();
    const w = de("wench"), b = de("bryan");
    w.guion.llamar("say_job", []);
    b.guion.llamar("say_cider", []);
    assert.equal(vale(w, "cider_1"), "2");
    assert.equal(vale(w, "cider_2"), "1");
  });

  test("y lo que dice Bryan es la línea del PRIMER ciclo, no la del segundo", { skip: !hay }, () => {
    // Éste es el control que distingue «la cadena corre» de «la cadena corre
    // DESDE EL PRINCIPIO». Con los 570 `eventname` sin nombrar, Bryan
    // contestaba «Oh! She still hasn't gotten it?» —la de la segunda vuelta—
    // porque su contador venía puesto desde el nacimiento.
    const dicho = [];
    const guiones = JSON.parse(readFileSync(`${EDANA}/guiones.json`, "utf8"));
    const bichos = JSON.parse(readFileSync(`${EDANA}/bichos.json`, "utf8"));
    const instancias = bichos.colocados.map((c, n) => ({
      id: `n${n}`, ficha: c, donde: [0, 0, 0], muerto: false, dormido: false, sinIa: false, vida: c.hp,
    }));
    const personaje = { id: "p1", nombre: "T", oro: 0, vida: 100 };
    const i = new InteraccionesNpc({
      sesion: { personaje }, guiones, areas: [],
      npcPorId: () => null, suceso: (t, x) => dicho.push(String(x)),
      losNpc: () => instancias, dondeEstaElJugador: () => [0, 0, 0], lineaDeVision: () => true,
    });
    const de = (n) => {
      const inst = instancias.find((x) => i.nombreUnicoDe(x) === n);
      const g = i.guionDe(inst);
      g.jugador = { ref: "p1", personaje, origen: "0 0 0" };
      return g;
    };
    const w = de("wench"), b = de("bryan");
    w.guion.llamar("say_job", []);
    dicho.length = 0;
    b.guion.llamar("say_cider", []);
    const suyo = dicho.join(" | ");
    assert.match(suyo, /on it's way/, `Bryan dijo: ${suyo}`);
    assert.doesNotMatch(suyo, /still hasn't gotten it/,
      "ésa es la de la SEGUNDA vuelta: el contador viene adelantado");
  });

  test("control negativo: un evento que no existe no mueve nada", { skip: !hay }, () => {
    const { de } = montar();
    const w = de("wench"), b = de("bryan");
    w.guion.llamar("say_qwrtypz", []);
    assert.equal(vale(b, "CIDER"), "0");
  });

  test("control de instrumento: sin `guionDeOtro`, el recado NO llega", { skip: !hay }, () => {
    // Si esto saliera verde, la prueba de arriba no estaría midiendo el
    // cableado entre NPC sino cualquier otra cosa que ponga `CIDER` a 1.
    const guiones = JSON.parse(readFileSync(`${EDANA}/guiones.json`, "utf8"));
    const bichos = JSON.parse(readFileSync(`${EDANA}/bichos.json`, "utf8"));
    const instancias = bichos.colocados.map((c, n) => ({
      id: `n${n}`, ficha: c, donde: [0, 0, 0], muerto: false, dormido: false, sinIa: false, vida: c.hp,
    }));
    const personaje = { id: "p1", nombre: "T", oro: 0, vida: 100 };
    const i = new InteraccionesNpc({
      sesion: { personaje }, guiones, areas: [],
      npcPorId: () => null, suceso: () => {},
      losNpc: () => instancias, dondeEstaElJugador: () => [0, 0, 0], lineaDeVision: () => true,
    });
    // Se le quita al entorno justo la pieza del 81.
    i.guionPorAsa = () => null;
    const de = (n) => {
      const g = i.guionDe(instancias.find((x) => i.nombreUnicoDe(x) === n));
      g.jugador = { ref: "p1", personaje, origen: "0 0 0" };
      return g;
    };
    const w = de("wench"), b = de("bryan");
    w.guion.llamar("say_job", []);
    assert.equal(vale(b, "CIDER"), "0", "llegó sin el cableado: la prueba de arriba no mide eso");
  });
});
