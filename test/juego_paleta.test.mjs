// La paleta de Master Sword, y la única cosa que le cambiamos.
//
// Estas comprobaciones existen para que dos cosas no se pierdan: que los
// colores están LEÍDOS y no elegidos, y que «nuestros paneles se leen mejor»
// es un número y no una impresión.

import test from "node:test";
import assert from "node:assert/strict";

import { MSR, deVgui, contraste, sobre, css, variablesCss, FONDO } from "../src/juego/paleta.js";

test("el alfa de VGUI está al revés, y se convierte", async (t) => {
  await t.test("alfa 0 es OPACO", () => {
    assert.equal(deVgui(255, 100, 100, 0), "rgb(255, 100, 100)");
  });

  await t.test("y alfa 255 es INVISIBLE", () => {
    // Los propios nombres del motor lo dicen: `Color_TransparentTextBG =
    // COLOR(0,0,0,255)` y `TransparentColor = COLOR(0,0,0,255)`.
    assert.equal(deVgui(0, 0, 0, 255), "rgba(0, 0, 0, 0.000)");
  });

  await t.test("el de en medio, a la mitad", () => {
    // `vgui_eventconsole.h:67`: `setBgColor(0, 0, 20, 128)`.
    assert.equal(deVgui(0, 0, 20, 128), "rgba(0, 0, 20, 0.498)");
  });

  await t.test("y leerlo como CSS da lo contrario — el control", () => {
    // Si alguien lo lee como opacidad, el fondo de los paneles de Master Sword
    // sale negro MACIZO donde el juego lo tiene invisible. No da error: da una
    // interfaz que tapa el mapa entero y parece deliberada.
    const comoCss = (a) => (a / 255).toFixed(3);
    assert.notEqual(comoCss(255), "0.000");
    assert.equal(comoCss(255), "1.000");
  });
});

test("los colores son los del código, no los de nuestro gusto", async (t) => {
  await t.test("vgui_container.cpp", () => {
    assert.deepEqual(MSR.tituloPanel, [255, 100, 100]);   // Color_TitleText
    assert.deepEqual(MSR.subtitulo, [160, 160, 160]);     // Color_SubtitleText
    assert.deepEqual(MSR.oro, [255, 255, 0]);             // Color_GoldText
    assert.deepEqual(MSR.seleccionado, [255, 0, 0]);      // Color_GearSelected
    assert.deepEqual(MSR.normal, [255, 255, 255]);        // Color_GearNormal
    assert.deepEqual(MSR.apagado, [100, 100, 100]);       // Color_TextNormal
  });

  await t.test("vgui_stats.cpp", () => {
    assert.deepEqual(MSR.textoHoja, [190, 190, 190]);     // Color_NormalText
    assert.deepEqual(MSR.instruccion, [128, 128, 128]);   // Color_InstructionText
    assert.deepEqual(MSR.bonoBueno, [0, 240, 0]);
    assert.deepEqual(MSR.bonoMalo, [255, 0, 0]);
  });

  await t.test("vgui_choosecharacter.cpp", () => {
    // El verde de «Zeth / At Edana» de la captura.
    assert.deepEqual(MSR.disponible, [0, 255, 0]);        // EnabledColor
    assert.deepEqual(MSR.noDisponible, [128, 128, 128]);  // DisabledColor
  });

  await t.test("y no hay ni un color de la paleta de Corinth", () => {
    // Los paneles llevaban `#f4a640` y `#efe2c2`, que son de Corinth y del
    // jharro. Aquí no pintan nada, y que no se cuelen otra vez es barato.
    const todos = Object.values(MSR).map((c) => c.slice(0, 3).join(","));
    assert.equal(todos.includes("244,166,64"), false, "el ámbar de Corinth");
    assert.equal(todos.includes("239,226,194"), false, "la crema de Corinth");
  });
});

test("la ÚNICA mejora: el panel tiene fondo, y se nota en el contraste", async (t) => {
  // Los cuatro fondos son los que de verdad hay detrás de un panel en Gate
  // City: el 63 % de su superficie está por debajo de 32 sobre 255, pero bajo
  // un farol llega a 181 y el cielo es claro.
  const FONDOS = [
    ["roca oscura", [17, 17, 17]],
    ["sillería media", [70, 68, 60]],
    ["bajo un farol", [181, 175, 140]],
    ["el cielo", [150, 175, 205]],
  ];
  // 0,88 de negro es lo que declara `FONDO`; lo que queda del mapa es 0,12.
  const conFondo = (fondo) => sobre(fondo, [0, 0, 0], 0.12);

  const medir = (texto) => {
    const sinPanel = FONDOS.map(([, f]) => contraste(texto, f));
    const conPanel = FONDOS.map(([, f]) => contraste(texto, conFondo(f)));
    return {
      peorSin: Math.min(...sinPanel), peorCon: Math.min(...conPanel),
      recorridoSin: Math.max(...sinPanel) - Math.min(...sinPanel),
      recorridoCon: Math.max(...conPanel) - Math.min(...conPanel),
    };
  };

  await t.test("el texto normal deja de ser ilegible bajo un farol", () => {
    const m = medir(MSR.textoHoja);
    // Sin fondo, el peor caso es 1,19: texto gris claro sobre piedra iluminada.
    // Eso no es «poco contraste», es invisible.
    assert.ok(m.peorSin < 1.5, `el peor caso de MSR debería ser malo: ${m.peorSin.toFixed(2)}`);
    assert.ok(m.peorCon > 9, `y el nuestro bueno: ${m.peorCon.toFixed(2)}`);
  });

  await t.test("y sobre todo DEJA DE DEPENDER de lo que haya detrás", () => {
    // Esto importa más que el peor caso: sin fondo, el mismo texto va de 10,16
    // a 1,19 según dónde mires. Un panel que se lee o no según hacia dónde
    // estés girado no es un panel.
    const m = medir(MSR.textoHoja);
    assert.ok(m.recorridoSin > 8, `sin fondo oscila ${m.recorridoSin.toFixed(2)}`);
    assert.ok(m.recorridoCon < 2, `con fondo oscila ${m.recorridoCon.toFixed(2)}`);
  });

  await t.test("el título y el oro, igual", () => {
    for (const [n, c] of [["título", MSR.tituloPanel], ["oro", MSR.oro]]) {
      const m = medir(c);
      assert.ok(m.peorCon > m.peorSin * 2, `${n}: ${m.peorSin.toFixed(2)} → ${m.peorCon.toFixed(2)}`);
      assert.ok(m.recorridoCon < m.recorridoSin, `${n} oscila menos`);
    }
  });

  await t.test("y el gris más apagado del juego NO llega, aun con fondo", () => {
    // `Color_TextNormal = (100,100,100)` da 3,1 sobre nuestro fondo, y WCAG
    // pide 4,5 para texto normal. **No lo cambiamos**: es el color del juego y
    // la instrucción era tomar su paleta. Lo que se hace es usarlo sólo donde
    // le corresponde —notas y detalles— y que quede dicho aquí en vez de
    // descubrirlo alguien con la vista cansada.
    const m = medir(MSR.apagado);
    assert.ok(m.peorCon < 4.5, `${m.peorCon.toFixed(2)} — sigue por debajo de 4,5, y se sabe`);
    // Pero mejora igual, que es lo que se está comprobando.
    assert.ok(m.peorCon > m.peorSin, `${m.peorSin.toFixed(2)} → ${m.peorCon.toFixed(2)}`);
  });
});

test("las variables CSS salen enteras y sin colores inventados", () => {
  const v = variablesCss();
  for (const n of ["--ms-fondo", "--ms-titulo", "--ms-oro", "--ms-si", "--ms-texto"]) {
    assert.ok(v.includes(n), `falta ${n}`);
  }
  assert.equal(css("oro"), "rgb(255, 255, 0)");
  assert.equal(FONDO, "rgba(0, 0, 0, 0.88)");
  assert.throws(() => css("noexiste"), /no hay color/);
});
