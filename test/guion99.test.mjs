// EL 99, parte R — el `if` VIEJO y `local` por evento, en TODAS las capas que
// corren guiones (doc/GUION_99.md).
//
// Las dos reglas del motor, citadas:
//
//   1. Un `if` sin paréntesis que falla hace `break` y abandona el RESTO de la
//      lista de órdenes en que está (`if (!Cmd.m_NewConditional) break;`,
//      script.cpp:5754-5757). Dentro de un `{ }` abandona ese `{ }` y no más.
//   2. `local` es del EVENTO: `Event.SetLocal` (scriptcmds.cpp:6577-6578) y
//      `Event.m_Variables.clearitems()` al acabarlo (script.cpp:5696). Un
//      `callevent` sin retraso no la pierde al volver: `RunScriptEventByName`
//      guarda y repone `m.CurrentEvent` (script.cpp:5013, :5025).
//
// El intérprete de partida (src/play/guion.js) ya las tenía desde el 67; el
// lector de objetos del horneado (`recogerObjeto`, src/bsp/script.js) no. Las
// pruebas le dan TEXTO a los dos —el lector lee ficheros, así que se escriben
// en una carpeta temporal— y no objetos de comando hechos a mano (la trampa del
// 67 de CLAUDE.md).

import test, { describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { leerFichaObjeto, condicionDeAtaque } from "../src/bsp/script.js";
import { partirGuion, Guion } from "../src/play/guion.js";
import { Brazo } from "../src/play/golpe.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const sinScripts = !existsSync(`${SCRIPTS}/items/swords_blood_drinker.script`);
const ARMAS = "build/msr/armas.json";
const sinArmas = !existsSync(ARMAS);

// ── Una carpeta `items/` de mentira, con los guiones escritos como TEXTO ────
const RAIZ = mkdtempSync(join(tmpdir(), "guion99-"));
mkdirSync(join(RAIZ, "items"));
after(() => rmSync(RAIZ, { recursive: true, force: true }));
let n = 0;
/** Escribe los guiones y devuelve la ficha del primero. */
function ficha(guiones) {
  const pre = `t${n++}_`;
  const nombres = Object.keys(guiones);
  for (const [nombre, texto] of Object.entries(guiones)) {
    writeFileSync(join(RAIZ, "items", `${pre}${nombre}.script`), texto.replaceAll("#include items/", `#include items/${pre}`), "latin1");
  }
  return leerFichaObjeto(RAIZ, `items/${pre}${nombres[0]}`);
}

const ATAQUE = (tipo, teclas, prio = 0) =>
  `\tlocal reg.attack.type ${tipo}\n\tlocal reg.attack.keys ${teclas}\n\tlocal reg.attack.priority ${prio}\n\tlocal reg.attack.dmg 10\n`;

// ── 1. EL `if` VIEJO, en el lector del horneado ─────────────────────────────

describe("el `if` VIEJO en el horneado (script.cpp:5754-5757)", () => {
  // La forma de `base_ranged`: el arma declara la constante y la base registra
  // detrás de `if !CUSTOM_ATTACK`.
  const base = `{ game_spawn\n\tif !CUSTOM_ATTACK\n${ATAQUE("strike-land", "+attack1")}\tregisterattack\n}\n`;

  test("falso: el ataque de detrás NO existe, y se apunta por qué", () => {
    const f = ficha({ arma: "{\n\tconst CUSTOM_ATTACK 1\n}\n#include items/base\n", base });
    assert.equal(f.ataques.length, 0);
    assert.deepEqual(f.ataquesTrasIfViejo.map((c) => c.condicion), ["!CUSTOM_ATTACK"]);
  });

  test("CONTROL: sin la constante el nombre vale su nombre, `atoi` da 0 y `!0` es cierto: SÍ existe", () => {
    // script.cpp:4741-4747 + `ScriptCmd_If`, scriptcmds.cpp:3963-3978.
    const f = ficha({ arma: "{\n\tconst OTRA 1\n}\n#include items/base\n", base });
    assert.equal(f.ataques.length, 1);
    assert.equal(f.ataquesTrasIfViejo.length, 0);
    assert.equal(f.ataquesTrasIfDudoso.length, 0, "un nombre que nadie pone no es dudoso");
  });

  test("si alguien la pone con `setvard`, NO se sabe al hornear: se queda y va a `ataquesTrasIfDudoso`", () => {
    const f = ficha({ arma: "{ otra\n\tsetvard CUSTOM_ATTACK 1\n}\n#include items/base\n", base });
    assert.equal(f.ataques.length, 1);
    assert.deepEqual(f.ataquesTrasIfDudoso.map((c) => c.condicion), ["!CUSTOM_ATTACK"]);
  });

  test("abandona el RESTO de la lista: el que va delante se queda", () => {
    const f = ficha({
      arma: `{\n\tconst A 0\n}\n{ game_spawn\n${ATAQUE("strike-land", "+attack1")}\tregisterattack\n\tif A\n\tregisterattack\n}\n`,
    });
    assert.equal(f.ataques.length, 1);
    assert.deepEqual(f.ataquesTrasIfViejo.map((c) => c.condicion), ["A"]);
  });

  test("dentro de un `{ }` sólo abandona ESE `{ }`: el de después del bloque se queda", () => {
    const f = ficha({
      arma: `{\n\tconst B 1\n\tconst C 0\n}\n{ game_spawn\n${ATAQUE("strike-land", "+attack1")}\tif ( B )\n\t{\n\t\tif C\n\t\tregisterattack\n\t}\n\tregisterattack\n}\n`,
    });
    assert.equal(f.ataques.length, 1, "el de dentro no, el de fuera sí");
    assert.deepEqual(f.ataquesTrasIfViejo.map((c) => c.condicion), ["C"]);
  });

  test("y el que es cierto deja seguir", () => {
    const f = ficha({ arma: `{\n\tconst A 1\n}\n{ game_spawn\n\tif A\n${ATAQUE("strike-land", "+attack1")}\tregisterattack\n}\n` });
    assert.equal(f.ataques.length, 1);
  });

  test("`condicionDeAtaque` sin la lista de variables sigue sin decidir un nombre suelto (el 98)", () => {
    assert.equal(condicionDeAtaque(new Map(), "NO_EXISTE"), null);
    assert.equal(condicionDeAtaque(new Map(), "NO_EXISTE", new Set()), false);
    assert.equal(condicionDeAtaque(new Map(), "!NO_EXISTE", new Set()), true);
    assert.equal(condicionDeAtaque(new Map(), "!PUESTA", new Set(["PUESTA"])), null);
  });
});

// ── 2. `local` POR EVENTO, en el lector del horneado ────────────────────────

describe("`local` vive un evento (script.cpp:5696), en el horneado", () => {
  test("un `registerattack` a pelo en OTRO evento es el ataque vacío, no una copia", () => {
    // La forma de `bows_base` (bows_base.script:34).
    const f = ficha({
      arma: `{ game_spawn\n${ATAQUE("charge-throw-projectile", "+attack1")}\tregisterattack\n\tcallevent otro\n}\n{ otro\n\tregisterattack\n}\n`,
    });
    assert.equal(f.ataques.length, 2);
    assert.equal(f.ataques[0].tipo, "charge-throw-projectile");
    assert.equal(f.ataques[1].tipo, null, "tipo sin declarar: strike-land por omisión en el motor");
    assert.deepEqual(f.ataques[1].teclas, [], "teclas sin poner: no casa nunca");
    assert.equal(f.ataques[1].dano, null);
  });

  test("CONTROL: dentro del MISMO evento sí sobrevive de un `registerattack` al siguiente", () => {
    const f = ficha({
      arma: `{ game_spawn\n${ATAQUE("strike-land", "+attack1")}\tregisterattack\n\tlocal reg.attack.keys -attack1\n\tregisterattack\n}\n`,
    });
    assert.equal(f.ataques.length, 2);
    assert.equal(f.ataques[1].tipo, "strike-land");
    assert.equal(f.ataques[1].dano, 10, "lo que no se reescribe se queda");
    assert.deepEqual(f.ataques[1].teclas, ["-attack1"]);
  });

  test("y un `callevent` en medio no la borra al volver, ni le mete las del llamado (script.cpp:5013, :5025)", () => {
    // El llamado va PRIMERO en el fichero a propósito: el lector va en orden de
    // fichero, y así lo que dejara puesto el bloque de antes se vería.
    const f = ficha({
      arma: `{ nada\n\tlocal reg.attack.range 99\n}\n{ game_spawn\n${ATAQUE("strike-land", "+attack1")}\tcallevent nada\n\tregisterattack\n}\n`,
    });
    assert.equal(f.ataques.length, 1);
    assert.equal(f.ataques[0].dano, 10, "lo de quien llama sigue");
    assert.equal(f.ataques[0].alcance, null, "el `local` del llamado es SUYO y muere con él");
  });

  test("`ficha.arma` se salta el vacío (resumen nuestro: el vacío no tiene habilidad ni daño)", () => {
    const f = ficha({
      arma: `{ game_spawn\n\tregisterattack\n\tcallevent otro\n}\n{ otro\n${ATAQUE("strike-land", "+attack1")}\tlocal reg.attack.stat swordsmanship\n\tregisterattack\n}\n`,
    });
    assert.equal(f.ataques[0].tipo, null);
    assert.equal(f.arma.habilidad, "swordsmanship");
  });

  test("`reg.proj.*` igual: se lee del evento que hace `registerprojectile` (giprojectile.cpp:24)", () => {
    const f = ficha({ arma: "{ game_spawn\n\tlocal reg.proj.dmg 50\n\tcallevent reg\n}\n{ reg\n\tregisterprojectile\n}\n" });
    assert.equal(f.proyectil.dano, null);
    const g = ficha({ arma: "{ game_spawn\n\tlocal reg.proj.dmg 50\n\tregisterprojectile\n}\n" });
    assert.deepEqual(g.proyectil.dano, { min: 50, max: 50 });
  });
});

// ── 3. LA MISMA REGLA EN EL INTÉRPRETE DE PARTIDA (src/play/guion.js) ──────

describe("las dos reglas en el intérprete de partida, con los mismos textos", () => {
  const corre = (texto, evento = "e") => {
    const g = new Guion({ eventos: partirGuion(texto).eventos });
    const dicho = [];
    g.entorno.hablar = (t) => dicho.push(t);
    g.llamar(evento, []);
    return dicho;
  };

  test("`local` de un evento no llega al siguiente", () => {
    assert.deepEqual(corre("{ e\n local X uno\n callevent f\n saytext X\n}\n{ f\n saytext X\n}"), ["X", "uno"]);
  });

  test("y lo de un `callevent` no pisa el `local` de quien llama", () => {
    assert.deepEqual(corre("{ e\n local X uno\n callevent f\n saytext X\n}\n{ f\n local X dos\n}"), ["uno"]);
  });

  test("el `if` viejo dentro de un `{ }` abandona ese `{ }` y no el evento", () => {
    assert.deepEqual(corre("{ e\n if ( 1 )\n {\n if CERO\n saytext no\n }\n saytext si\n}"), ["si"]);
  });
});

// ── 4. EN LOS GUIONES DEL JUEGO ─────────────────────────────────────────────

describe("en los guiones de verdad", { skip: sinScripts }, () => {
  const de = (id) => leerFichaObjeto(SCRIPTS, `items/${id}`);
  const cargados = (f) => f.ataques.filter((a) => a.carga > 0);

  test("la Blood Drinker: se va el cargado de SERIE (dos copias), se queda el suyo", () => {
    const f = de("swords_blood_drinker");
    // Antes: normal + tres `-attack1` con carga 1 + el especial de 2,5.
    assert.equal(f.ataques.length, 3);
    assert.deepEqual(f.ataquesTrasIfViejo.map((c) => c.condicion), ["!CUSTOM_REGISTER_CHARGE1", "!CUSTOM_REGISTER_CHARGE1"]);
    // Los dos de serie pedían 2 de destreza (base_melee y la base a dos
    // manos); el suyo pide `BASE_LEVEL_REQ`, 32, y el especial 34.
    assert.deepEqual(cargados(f).map((a) => [a.carga, a.pideHabilidad]), [[1, 32], [2.5, 34]]);
  });

  test("los cuatro arcos de Torkalath: el vacío y la esfera; el Orión, sólo el vacío", () => {
    for (const id of ["bows_telf1", "bows_telf2", "bows_telf3", "bows_telf4"]) {
      const f = de(id);
      assert.deepEqual(f.ataques.map((a) => a.tipo), [null, "charge-throw-projectile"], id);
      assert.equal(f.ataques[1].proyectil, "proj_arrow_spiral", id);
    }
    // `custom_register` del Orión pone sus `local` y NO llama a `registerattack`
    // (bows_orion1.script:53-74): en el motor su único ataque es el vacío.
    const o = de("bows_orion1");
    assert.deepEqual(o.ataques.map((a) => a.tipo), [null]);
  });

  test("el cuchillo de fuego y la Frostblade ya no empatan su tiro con un mandoble cargado", () => {
    for (const id of ["smallarms_k_fire", "swords_frostblade55"]) {
      const f = de(id);
      const tiro = f.ataques.find((a) => a.tipo === "charge-throw-projectile");
      const rivales = f.ataques.filter((a) => a !== tiro && a.carga === tiro.carga && a.prioridad === tiro.prioridad);
      assert.equal(rivales.length, 0, id);
    }
  });

  test("CONTROL: la espada oxidada no cambia (no declara nada de esto)", () => {
    const f = de("swords_rsword");
    assert.equal(f.ataquesTrasIfViejo.length, 0);
    assert.ok(f.ataques.length >= 2);
  });
});

describe("y jugando, con la ficha horneada y un `Brazo` de verdad", { skip: sinArmas }, () => {
  const cat = JSON.parse(readFileSync(ARMAS, "utf8"));
  const arma = (id) => cat.armas.find((a) => a.id === id);

  test("el cuchillo de fuego tira su cuchillo con CUALQUIER moneda", () => {
    for (const z of [0.1, 0.9]) {
      const b = new Brazo(arma("smallarms_k_fire"), { azar: () => z });
      // Clic, segundo clic aguantando, soltar con un nivel: lo que el jugador hace.
      b.cargaHecha = 1;
      const { ataque } = b.elegir({ pulsado: false, destreza: 100 });
      assert.equal(ataque?.tipo, "charge-throw-projectile", `azar ${z}`);
    }
  });

  test("el arco de Torkalath es de tiro y sólo tiene la esfera", () => {
    const b = new Brazo(arma("bows_telf1"));
    assert.equal(b.esDeTiro, true);
    assert.deepEqual(b.ataques.map((a) => a.proyectil), ["proj_arrow_spiral"]);
  });
});
