// LAS BARRAS DEL README NO PUEDEN MENTIR SIN QUE ESTO SE PONGA ROJO.
//
// Una insignia de progreso escrita a mano es un número que nadie vuelve a mirar:
// el día que se enciende un ajuste más, el README sigue diciendo el de antes, y
// en verde. Esta prueba mide hoy lo que se puede medir hoy y exige que el README
// diga eso.
//
// Lo que se mide SIEMPRE —también en una copia sin el contenido del juego, que es
// lo que tendrá quien clone el repositorio—: las dos barras de ajustes, que salen
// de `cuenta()` y no necesitan nada de fuera. Las otras cuatro necesitan `../MSC/`
// y un horneado al día, y sin ellos se saltan diciendo por qué, en vez de pasar en
// verde sin haber mirado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INICIO, FIN, porcentaje, color, escapar, insignia, bloque, ponerBloque,
  sinComentarios, comandosRegistrados, medir,
} from "../tools/insignias.mjs";
import { cuenta as cuentaAjustes } from "../src/play/ajustes.js";
import { cuenta as cuentaServidor } from "../src/play/crearpartida.js";

const README = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "README.md"), "utf8");

test("las insignias del README", async (t) => {
  await t.test("el tanto por ciento se redondea HACIA ABAJO", () => {
    // 19/27 es 70,37; 2/3 es 66,67 y redondeando saldría 67. Hacia abajo nunca
    // promete lo que no hay.
    assert.equal(porcentaje(19, 27), 70);
    assert.equal(porcentaje(2, 3), 66);
    assert.equal(porcentaje(0, 0), 0);
    assert.equal(porcentaje(325, 325), 100);
  });

  await t.test("el color va por tramos, y verde fuerte sólo de 95 arriba", () => {
    assert.equal(color(22), "red");
    assert.equal(color(25), "orange");
    assert.equal(color(70), "yellowgreen");
    assert.equal(color(94), "green");
    assert.equal(color(95), "brightgreen");
  });

  await t.test("el guion de shields se dobla ANTES de codificar", () => {
    // Si se codificara primero no habría guion que doblar y la URL partiría el
    // texto por donde no es.
    assert.equal(escapar("create-server"), "create--server");
    assert.equal(escapar("a_b"), "a__b");
    assert.equal(escapar("73/325 · 22%"), "73%2F325%20%C2%B7%2022%25");
  });

  await t.test("una insignia, letra por letra", () => {
    // Escrita a mano a propósito: es la regla del 75. Armar el esperado con la
    // propia función mediría que la función se llama, no que escribe esto.
    assert.equal(
      insignia({ etiqueta: "Edana scripts", hechos: 19, total: 27 }),
      "![Edana scripts: 19/27 · 70%](https://img.shields.io/badge/Edana%20scripts-19%2F27%20%C2%B7%2070%25-yellowgreen)",
    );
  });

  await t.test("lo comentado NO cuenta como comando — de ahí salía el 223", () => {
    // `scriptcmds.cpp` tiene `//m_GlobalCmdHash["else"]` y un `moditem` dentro
    // de un comentario de bloque. Contarlos daba 223; vivos son 221.
    const cpp = [
      'm_GlobalCmdHash["if"] = f;',
      '//m_GlobalCmdHash["else"] = f;    // comentado con //',
      '/* m_GlobalCmdHash["moditem"] = f; */',
      'm_ScriptCommands.add(scriptcmdname_t("say"));',
      'x = 1; // m_GlobalCmdHash["detras"] = f;',
    ].join("\n");
    assert.deepEqual(comandosRegistrados(cpp).sort(), ["if", "say"]);
    // Y el control positivo: sin quitar comentarios, los cinco se contarían.
    const crudo = [...cpp.matchAll(/m_GlobalCmdHash\["([^"]+)"\]|scriptcmdname_t\(\s*"([^"]+)"/g)];
    assert.equal(crudo.length, 5);
    assert.ok(!sinComentarios(cpp).includes("moditem"));
  });

  await t.test("cambiar el bloque exige las dos marcas, y no toca lo de fuera", () => {
    const r = `antes\n${INICIO}\nviejo\n${FIN}\ndespués`;
    assert.equal(ponerBloque(r, `${INICIO}\nnuevo\n${FIN}`), `antes\n${INICIO}\nnuevo\n${FIN}\ndespués`);
    assert.throws(() => ponerBloque("sin marcas", "x"), /marcas/);
  });

  await t.test("el README dice los ajustes de HOY — esto no necesita el juego", () => {
    for (const [etiqueta, c] of [["options", cuentaAjustes()], ["create server", cuentaServidor()]]) {
      const esperada = insignia({ etiqueta, hechos: c.vivos, total: c.total });
      assert.ok(README.includes(esperada),
        `el README no dice «${etiqueta} ${c.vivos}/${c.total}»: pasa \`npm run insignias\``);
      // El control positivo: con un ajuste más encendido, el README ya no
      // valdría. Sin esto, la línea de arriba podría ser verde por construcción.
      const otra = insignia({ etiqueta, hechos: c.vivos + 1, total: c.total });
      assert.ok(!README.includes(otra), `el README también casaría con ${c.vivos + 1}: no distingue`);
    }
  });

  const barras = await medir();
  const sinMedir = barras.filter((b) => b.falta);
  await t.test("y con el juego al lado, el bloque entero es el de hoy", {
    skip: sinMedir.length ? `no se puede medir: ${sinMedir.map((b) => b.falta).join("; ")}` : false,
  }, () => {
    const a = README.indexOf(INICIO);
    const actual = README.slice(a, README.indexOf(FIN) + FIN.length);
    assert.equal(actual, bloque(barras), "las barras del README son de otra medida: pasa `npm run insignias`");
  });
});
