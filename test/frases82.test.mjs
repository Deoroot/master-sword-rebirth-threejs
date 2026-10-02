// EXPERIMENTO 82 · el `speaker` de Edana y los grupos de `sentences.txt`.
//
// ── LO QUE ESTA PRUEBA NO PUEDE MEDIR ──────────────────────────────────────
//
// Que se oiga una codorniz. Aquí se mide el formato y los dos relojes; que el
// `.wav` llegue al `AudioContext` lo tendría que medir una sonda, y mientras no
// exista no se cuenta ningún verde por él.
//
// ── Y UNA COSA QUE SÍ MIDE, Y ES LA QUE IMPORTA ───────────────────────────
//
// Que los ocho `.wav` del grupo `WILD` **no están en `assets/msr`**. No es un
// hueco del juego: son de Half-Life y el motor los hereda de `valve/`. La
// prueba lo exige al revés de como suena —exige que NO estén en el mod— para
// que el día que alguien los copie dentro se entere, porque eso sería
// redistribuir contenido de Valve (ver CREDITOS.md).

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  leerFrases, leerFrase, archivosDe, fraseDelGrupo,
  primerAnuncio, siguienteAnuncio, ANUNCIO_MIN, ANUNCIO_MAX,
} from "../src/play/frases.js";
import { leerBsp, leerEntidades } from "../src/bsp/lector.js";

const MSR = process.env.MSR_ASSETS ?? "../MSC/assets/msr";
const RUTA = `${MSR}/sound/sentences.txt`;
const hay = existsSync(RUTA);
const grupos = () => leerFrases(readFileSync(RUTA, "latin1"));

describe("EL FORMATO de `sentences.txt`", () => {
  test("el grupo es el nombre sin los dígitos finales", { skip: !hay }, () => {
    const g = grupos();
    assert.deepEqual([...g.keys()].sort(), ["ROCKET", "WILD"]);
  });

  test("WILD tiene 22 frases porque tres índices están REPETIDOS", { skip: !hay }, () => {
    // El motor indexa por orden de lectura, no por el número del nombre.
    // `WILD9`, `WILD10` y `WILD11` están dos veces, y las seis cuentan.
    const w = grupos().get("WILD");
    assert.equal(w.length, 22);
    const nombres = w.map((f) => f.nombre);
    assert.equal(new Set(nombres).size, 19, "ya no hay nombres repetidos");
    for (const n of ["WILD9", "WILD10", "WILD11"]) {
      assert.equal(nombres.filter((x) => x === n).length, 2, `${n} no está dos veces`);
    }
    // Y las dos versiones son DISTINTAS: si fueran iguales, perderlas no se
    // notaría y este detalle no merecería portarse.
    const nueves = w.filter((f) => f.nombre === "WILD9");
    assert.notDeepEqual(nueves[0].palabras, nueves[1].palabras);
  });

  test("la carpeta vale para toda la línea", { skip: !hay }, () => {
    for (const f of grupos().get("WILD")) {
      for (const p of f.palabras) assert.match(p.archivo, /^ambience\//);
    }
  });

  test("el `(...)` SUELTO de delante son los valores por omisión de la línea", () => {
    // `WILD0 ambience/(v30) quail1(p103), quail1(t10), quail1(p101)`: las tres
    // codornices van al 30 % **y cada una con su propio tono**. Sin esto suenan
    // las tres a volumen entero, que es tres veces más alto de lo escrito.
    const f = leerFrase("WILD0", "ambience/(v30) quail1(p103), quail1(t10), quail1(p101)");
    assert.equal(f.palabras.length, 3);
    for (const p of f.palabras) assert.equal(p.volumen, 0.3);
    assert.deepEqual(f.palabras.map((p) => p.tono), [1.03, 1, 1.01]);
    assert.equal(f.palabras[1].recorte, 10);
  });

  test("y el de la PALABRA pisa al de la línea", () => {
    const f = leerFrase("X0", "a/(v30) uno(v90), dos");
    assert.equal(f.palabras[0].volumen, 0.9);
    assert.equal(f.palabras[1].volumen, 0.3);
  });

  test("dos modificadores en el mismo paréntesis, en cualquier orden", () => {
    // `hawk1(p98 v30)` y `hawk1(p105 v20)` del mod.
    const a = leerFrase("X0", "a/hawk1(p98 v30)").palabras[0];
    assert.equal(a.tono, 0.98);
    assert.equal(a.volumen, 0.3);
    const b = leerFrase("X0", "a/hawk1(v30 p98)").palabras[0];
    assert.deepEqual([b.tono, b.volumen], [a.tono, a.volumen]);
  });

  test("un paréntesis de más no rompe la frase: el mod tiene dos así", { skip: !hay }, () => {
    // `WILD8 ambience/quail1(p98 v20))` y `WILD13` igual. Si esto se leyera
    // estricto, el pueblo perdería dos de sus 22 frases sin un solo error.
    const f = leerFrase("WILD8", "ambience/quail1(p98 v20))");
    assert.equal(f.palabras.length, 1);
    assert.equal(f.palabras[0].archivo, "ambience/quail1.wav");
    assert.equal(f.palabras[0].volumen, 0.2);
    // Y en el fichero de verdad, las 22 traen al menos una palabra.
    for (const x of grupos().get("WILD")) assert.ok(x.palabras.length >= 1, `${x.nombre} vacía`);
  });

  test("un modificador que no se entiende se APUNTA, no se tira", () => {
    // La vacuna del apartado 4: si algún día aparece un `s10`, hay que verlo.
    //
    // Y son DOS caminos, no uno — esta prueba sólo recorría el primero y una
    // rotura deliberada del segundo **se quedó verde**:
    //
    //   `s10`  una letra que no conocemos con su número detrás: cae en el
    //          `else` del reparto por letra.
    //   `v`    algo que no tiene la forma `letra+número`: cae en el `if (!m)`.
    //
    // Si la prueba se queda en uno de los dos, el otro puede tirar lo que no
    // entiende sin que nada se ponga rojo, que es exactamente el silencio que
    // esta función existe para no tener.
    const porLetra = leerFrase("X0", "a/uno(s10 v50)").palabras[0];
    assert.deepEqual(porLetra.sinPortar, ["s10"]);
    assert.equal(porLetra.volumen, 0.5);

    const sinForma = leerFrase("X0", "a/uno(v p50)").palabras[0];
    assert.deepEqual(sinForma.sinPortar, ["v"], "un token sin número no se apuntó");
    assert.equal(sinForma.tono, 0.5);
  });

  test("y en el fichero del mod NO se apunta ninguno: 0 de 29", { skip: !hay }, () => {
    // El control que convierte «sólo portamos v/p/t» en un dato y no en una
    // excusa. Y se cuenta, no se escribe.
    const todas = [...grupos().values()].flat();
    assert.equal(todas.length, 29);
    const raros = todas.flatMap((f) => f.palabras).filter((p) => p.sinPortar);
    assert.equal(raros.length, 0, `modificadores sin portar: ${JSON.stringify(raros)}`);
  });

  test("los comentarios `//` del fichero no son frases", { skip: !hay }, () => {
    for (const f of [...grupos().values()].flat()) assert.ok(!f.nombre.startsWith("//"));
  });
});

describe("LOS .WAV DEL PREGONERO SON DE HALF-LIFE, y eso es el dato", () => {
  test("WILD nombra ocho archivos, todos de `ambience/`", { skip: !hay }, () => {
    const soloWild = new Map([["WILD", grupos().get("WILD")]]);
    const a = archivosDe(soloWild);
    assert.equal(a.length, 8);
    assert.deepEqual(a.sort(), [
      "ambience/bee1.wav", "ambience/bee2.wav", "ambience/des_wind1.wav",
      "ambience/des_wind2.wav", "ambience/des_wind3.wav", "ambience/hawk1.wav",
      "ambience/quail1.wav", "ambience/wren1.wav",
    ]);
  });

  test("NINGUNO está en `assets/msr`: el mod los hereda de `valve/`", { skip: !hay }, () => {
    // Escrito al revés a propósito. Si alguien copiara estos `.wav` dentro de
    // `assets/msr` —o, peor, a `public/`— esto se pone rojo, y tiene que
    // ponerse: son de Valve y el permiso no está pedido (CREDITOS.md).
    //
    // Y a la vez es la prueba de que la conclusión «el juego no tiene esto» era
    // la equivocada: el `sentences.txt` que los nombra **sí** está en el mod.
    assert.ok(existsSync(RUTA), "sentences.txt sí está en el mod");
    const soloWild = new Map([["WILD", grupos().get("WILD")]]);
    for (const a of archivosDe(soloWild)) {
      assert.ok(!existsSync(`${MSR}/sound/${a}`), `${a} está en assets/msr: ¿se ha copiado contenido de Valve?`);
    }
  });
});

describe("LOS DOS RELOJES del `speaker` (sound.cpp:1816-1904)", () => {
  const dado = (v) => () => v;

  test("el primer anuncio cae entre 5 y 15 segundos", () => {
    assert.equal(primerAnuncio({ azar: dado(0) }), 5);
    assert.equal(primerAnuncio({ azar: dado(1) }), 15);
    assert.equal(primerAnuncio({ azar: dado(0.5) }), 10);
  });

  test("y con `SPEAKER_START_SILENT` NO se programa: devuelve null", () => {
    // No es «suena más tarde»: es que no suena hasta que lo disparen. Un 0 o un
    // Infinity aquí serían los dos mentira.
    assert.equal(primerAnuncio({ empiezaCallado: true, azar: dado(0) }), null);
  });

  test("los siguientes, entre 15 segundos y dos minutos y cuarto", () => {
    assert.equal(ANUNCIO_MIN, 15);
    assert.equal(ANUNCIO_MAX, 135);
    const a = siguienteAnuncio({ ahora: 100, esperaDeCharla: 0, azar: dado(0) });
    assert.equal(a.habla, true);
    assert.equal(a.cuando, 115);
    const b = siguienteAnuncio({ ahora: 100, esperaDeCharla: 0, azar: dado(1) });
    assert.equal(b.cuando, 235);
  });

  test("SE CALLA si un vecino está hablando, y se reprograma SIN sonar", () => {
    // `g_talkWaitTime` es global y compartido con los NPC: «used so that two
    // NPCs don't talk at once». Esto es lo que impide que el ruido de campo
    // pise a la gente del pueblo.
    const r = siguienteAnuncio({ ahora: 100, esperaDeCharla: 120, azar: dado(0) });
    assert.equal(r.habla, false);
    assert.equal(r.cuando, 125);          // `g_talkWaitTime + RANDOM_FLOAT(5,10)`
    // Y no toca la espera: no es él el que está hablando.
    assert.equal(r.esperaDeCharla, 120);
  });

  test("al hablar, calla a los demás cinco segundos", () => {
    const r = siguienteAnuncio({ ahora: 100, esperaDeCharla: 0, azar: dado(0) });
    assert.equal(r.esperaDeCharla, 105);
  });

  test("la condición es `<=`, no `<`: en el instante exacto todavía calla", () => {
    // `if (gpGlobals->time <= g_talkWaitTime)`. Con `<` hablaría justo encima
    // del vecino en el fotograma del empate.
    assert.equal(siguienteAnuncio({ ahora: 120, esperaDeCharla: 120, azar: dado(0) }).habla, false);
    assert.equal(siguienteAnuncio({ ahora: 121, esperaDeCharla: 120, azar: dado(0) }).habla, true);
  });
});

describe("EL SORTEO, y el grupo que no existe", () => {
  test("reparte por el grupo entero y no se sale por el extremo", { skip: !hay }, () => {
    const g = grupos();
    assert.equal(fraseDelGrupo(g, "WILD", () => 0).nombre, "WILD0");
    // Con el dado a 1 exacto, `floor(1*22)` sería 22 y se saldría del array.
    assert.ok(fraseDelGrupo(g, "WILD", () => 1), "se sale del grupo con el dado a 1");
    assert.equal(fraseDelGrupo(g, "WILD", () => 1).nombre, "WILD18");
  });

  test("un grupo que no existe devuelve null, que es lo que el motor avisa", { skip: !hay }, () => {
    // «Level Design Error! SPEAKER has bad sentence group name». Un `null` es
    // distinto de un silencio: se puede imprimir.
    assert.equal(fraseDelGrupo(grupos(), "NOEXISTE", () => 0), null);
  });
});

describe("EL `speaker` DE EDANA, leído del `.bsp`", () => {
  const MAPAS = `${MSR}/maps`;
  const hayEdana = existsSync(`${MAPAS}/edana.bsp`);

  test("es UNO, con `message WILD` y `health 5`", { skip: !hayEdana }, () => {
    const s = leerEntidades(leerBsp(`${MAPAS}/edana.bsp`)).filter((e) => e.classname === "speaker");
    assert.equal(s.length, 1);
    assert.equal(s[0].message, "WILD");
    // `flvolume = pev->health * 0.1` (sound.cpp:1827): `health` no es vida.
    assert.equal(Number(s[0].health) * 0.1, 0.5);
    assert.equal(s[0].spawnflags, undefined, "trae spawnflags: ¿empieza callado?");
  });

  test("y su grupo existe en `sentences.txt`, con frases dentro", { skip: !(hayEdana && hay) }, () => {
    // La costura: el nombre que pone el MAPA contra el fichero de FRASES. Es
    // justo el sitio del 63 —dos piezas buenas y el viaje roto— y la única
    // prueba que lo recorre.
    const s = leerEntidades(leerBsp(`${MAPAS}/edana.bsp`)).find((e) => e.classname === "speaker");
    const f = fraseDelGrupo(grupos(), s.message, () => 0.5);
    assert.ok(f, `el grupo "${s.message}" del mapa no está en sentences.txt`);
    assert.ok(f.palabras.length >= 1);
  });

  test("y GATE CITY no tiene ninguno: el cero, dicho", { skip: !existsSync(`${MAPAS}/gatecity.bsp`) }, () => {
    // La trampa del 50 escrita como control: si algún día Gate City trajera
    // uno, el único caso del juego dejaría de ser único y habría que medirlo.
    const s = leerEntidades(leerBsp(`${MAPAS}/gatecity.bsp`)).filter((e) => e.classname === "speaker");
    assert.equal(s.length, 0);
  });
});
