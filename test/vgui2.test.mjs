// EL ESQUEMA DE VGUI2, comprobado sin navegador.
//
// Lo que se puede comprobar leyendo: que el lector de KeyValues aguanta el
// anidamiento y los comentarios, que los nombres de color se resuelven, que el
// alfa va al derecho —al revés que en VGUI1—, que la letra se elige por la
// altura de la pantalla y arrastra su cadena de repuesto, y que los alias de
// borde se siguen.
//
// Lo que NO se puede y va en `sondas/vgui2_34.mjs`: que la ventana se vea, que
// la letra que sale sea Verdana de verdad y que las pestañas cambien.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { leerKeyValues, colorDe, resolver, leerFuentes, leerBordes } from "../tools/vgui2.mjs";
import { css, fuenteDe, bordeDe, bordeCss, texto, POR_DEFECTO } from "../src/vgui2/esquema.js";
import { deVgui } from "../src/juego/paleta.js";
import { AJUSTES, PESTANAS, ajuste, cuenta, porDefecto, leerAjustes } from "../src/play/ajustes.js";
import { PESTANAS as PESTANAS_SRV, COLUMNAS } from "../src/vgui2/servidores.js";
import { PESTANAS as PESTANAS_CS, AJUSTES as AJUSTES_CS, MAPAS, mapaElegido,
         cuenta as cuentaCS } from "../src/play/crearpartida.js";
import { MAPAS_PORTADOS } from "../src/play/mapa.js";

const ajusteCS = (clave) => AJUSTES_CS.find((a) => a.clave === clave);

const FICHA = "build/msr/vgui2.json";
const ficha = existsSync(FICHA) ? JSON.parse(readFileSync(FICHA, "utf8")) : null;

// El `config.cfg` de la instalación que hay al lado. Como el resto del juego, no
// se versiona: sin él las pruebas que lo miran se saltan, no fallan.
const RUTA_CFG = "../MSC/assets/msr/config.cfg";
const CFG = existsSync(RUTA_CFG) ? readFileSync(RUTA_CFG, "utf8") : null;

// ── EL LECTOR DE KEYVALUES ──────────────────────────────────────────────────

test("el lector parte pares sueltos y subbloques en el mismo nivel", () => {
  // Es justo lo que hace `Borders`: `BaseBorder "InsetBorder"` al lado de
  // `InsetBorder { … }`. Una expresión regular no distingue los dos.
  const r = leerKeyValues(`
    Borders
    {
      BaseBorder "InsetBorder"
      InsetBorder { "inset" "0 0 1 1" }
    }
  `);
  assert.equal(r.Borders.BaseBorder, "InsetBorder");
  assert.equal(r.Borders.InsetBorder.inset, "0 0 1 1");
});

test("el lector aguanta cuatro niveles, que es lo que tiene un borde", () => {
  const r = leerKeyValues(`
    Scheme { Borders { InsetBorder { Left { "1" { "color" "BorderDark" } } } } }
  `);
  assert.equal(r.Scheme.Borders.InsetBorder.Left["1"].color, "BorderDark");
});

test("los comentarios // se van, y no se llevan por delante la línea siguiente", () => {
  const r = leerKeyValues(`
    Colors
    {
      // "Trampa" "1 2 3 4"
      "BaseText" "196 220 255 220"   // el texto de las listas
      "TitleBG"  "206 206 206 0"
    }
  `);
  assert.equal(r.Colors.Trampa, undefined);
  assert.equal(r.Colors.BaseText, "196 220 255 220");
  assert.equal(r.Colors.TitleBG, "206 206 206 0");
});

test("una palabra sin comillas también es una clave", () => {
  // El archivo mezcla las dos formas: `Scheme` y `Colors` van pelados, los
  // colores entre comillas.
  const r = leerKeyValues(`Scheme { Colors { "A" "1 1 1 1" } }`);
  assert.equal(r.Scheme.Colors.A, "1 1 1 1");
});

// ── LOS COLORES ─────────────────────────────────────────────────────────────

test("un color son tres números o cuatro, y el alfa por defecto es opaco", () => {
  assert.deepEqual(colorDe("196 220 255 220"), [196, 220, 255, 220]);
  assert.deepEqual(colorDe("206 206 206"), [206, 206, 206, 255]);
});

test("lo que no es un color no se convierte en uno", () => {
  // `TextInset "6"`, `MenuItemVisibilityRate "0.03"` y
  // `TitleBarIcon "resource/icon_steam"` viven en el mismo bloque que los
  // colores. Si `colorDe` fuera generoso, el icono saldría como un color.
  assert.equal(colorDe("6"), null);
  assert.equal(colorDe("0.03"), null);
  assert.equal(colorDe("resource/icon_steam"), null);
  assert.equal(colorDe("ControlText"), null);
});

test("un nombre de color se resuelve contra la tabla", () => {
  const colores = { ControlText: [196, 220, 255, 200] };
  assert.deepEqual(resolver("ControlText", colores), [196, 220, 255, 200]);
  assert.deepEqual(resolver("1 2 3 4", colores), [1, 2, 3, 4]);
  assert.equal(resolver("6", colores), "6");
});

test("EL ALFA DE VGUI2 VA AL DERECHO, y en VGUI1 al revés", () => {
  // Ésta es la trampa de tener los dos sistemas en la misma pantalla, y se
  // comprueba con dos colores del propio archivo:
  //
  //   "TitleBG"  "206 206 206 0"     la barra de título
  //   "BaseText" "196 220 255 220"   el texto de las listas
  //
  // Al derecho: la barra de título no se ve y el texto sí. Al revés —que es lo
  // que hace `deVgui()` para VGUI1— la barra sería una banda gris opaca y el
  // texto casi invisible. En la captura del juego pasa lo primero.
  assert.equal(css([206, 206, 206, 0]), "rgba(206,206,206,0.000)");
  assert.match(css([196, 220, 255, 220]), /0\.86/);

  // Y el de VGUI1, para que quede claro que son CONTRARIOS y que nadie los
  // unifique «porque son lo mismo»: el mismo `206 206 206 0` sale opaco allí y
  // transparente aquí.
  assert.equal(deVgui(206, 206, 206, 0), "rgb(206, 206, 206)");
  assert.equal(css([206, 206, 206, 0]), "rgba(206,206,206,0.000)");
});

// ── LAS LETRAS ──────────────────────────────────────────────────────────────

const FUENTES = leerFuentes({
  EngineFont: {
    1: { name: "Verdana Bold", tall: "12", weight: "0", yres: "480 599", dropshadow: "1" },
    2: { name: "Verdana Bold", tall: "13", weight: "0", yres: "600 767", dropshadow: "1" },
    3: { name: "Verdana Bold", tall: "14", weight: "0", yres: "768 1023", dropshadow: "1" },
    6: { name: "Verdana", tall: "12", weight: "600", dropshadow: "1" },
    7: { name: "Arial", tall: "11", weight: "800", dropshadow: "1" },
  },
});

test("la fuente se lee con sus rangos y sus banderas", () => {
  assert.equal(FUENTES.EngineFont.length, 5);
  assert.deepEqual(FUENTES.EngineFont[0].yres, [480, 599]);
  assert.equal(FUENTES.EngineFont[0].sombra, true);
  assert.equal(FUENTES.EngineFont[3].yres, undefined);
});

test("el rango de altura elige el TAMAÑO, como el g_ResArray de VGUI1", () => {
  const f = { fuentes: FUENTES, colores: {}, bordes: {}, alias: {} };
  assert.equal(fuenteDe(f, "EngineFont", 480).alto, 12);
  assert.equal(fuenteDe(f, "EngineFont", 599).alto, 12);
  assert.equal(fuenteDe(f, "EngineFont", 600).alto, 13);
  assert.equal(fuenteDe(f, "EngineFont", 767).alto, 13);
  assert.equal(fuenteDe(f, "EngineFont", 900).alto, 14);
});

test("una altura fuera de todos los rangos cae en la variante SIN rango", () => {
  // Y no en la más grande ni en la primera: las sin rango son las de repuesto,
  // y por eso están al final de la lista.
  const f = { fuentes: FUENTES, colores: {}, bordes: {}, alias: {} };
  assert.equal(fuenteDe(f, "EngineFont", 2000).alto, 12);   // la "6", Verdana 12
});

test("«Verdana Bold» no se pide como familia: se pide Verdana en negrita", () => {
  // Si se pide la familia «Verdana Bold» el navegador no la encuentra y cae al
  // repuesto. Es como se pierde la letra del juego sin que salga ningún error.
  const f = { fuentes: FUENTES, colores: {}, bordes: {}, alias: {} };
  const r = fuenteDe(f, "EngineFont", 600);
  assert.equal(r.negrita, true);
  assert.match(r.css, /700 13px/);
  assert.match(r.css, /Verdana/);
  assert.doesNotMatch(r.css, /Verdana Bold/);
});

test("la cadena de repuesto son TODAS las variantes en su orden", () => {
  // «if a font fails to load then the subsequent fonts will replace»
  // (TrackerScheme.res:188) es exactamente lo que hace `font-family` con comas.
  const f = { fuentes: FUENTES, colores: {}, bordes: {}, alias: {} };
  const r = fuenteDe(f, "EngineFont", 600);
  const i = r.css.indexOf("Verdana"), j = r.css.indexOf("Arial"), k = r.css.indexOf("sans-serif");
  assert.ok(i < j && j < k, `el orden de repuesto se perdió: ${r.css}`);
});

test("una fuente que no existe no deja el panel sin letra", () => {
  const r = fuenteDe(null, "NoExisteEstaFuente", 600);
  assert.ok(r.alto > 0);
  assert.match(r.css, /px/);
});

// ── LOS BORDES ──────────────────────────────────────────────────────────────

const { bordes, alias } = leerBordes({
  BaseBorder: "InsetBorder",
  ButtonBorder: "RaisedBorder",
  InsetBorder: {
    inset: "0 0 1 1",
    Left: { 1: { color: "BorderDark", offset: "0 1" } },
    Right: { 1: { color: "BorderBright", offset: "1 0" } },
  },
  RaisedBorder: {
    inset: "0 0 1 1",
    Left: { 1: { color: "BorderBright", offset: "0 1" } },
  },
  TitleButtonBorder: {
    inset: "0 0 1 1",
    Top: { 4: { color: "BorderBright", offset: "0 0" } },
  },
});

test("los alias se separan de los bordes, porque son indirecciones", () => {
  assert.equal(alias.BaseBorder, "InsetBorder");
  assert.equal(alias.ButtonBorder, "RaisedBorder");
  assert.equal(bordes.BaseBorder, undefined);
  assert.ok(bordes.InsetBorder);
});

test("EL NÚMERO DE LA LÍNEA ES SU GROSOR, no su orden", () => {
  // `TitleButtonBorder` tiene su `Top` en la clave "4": son cuatro píxeles de
  // línea, y es lo que separa el marco de una ventana del borde de un botón.
  // Leerlo como un orden da un marco de un píxel y la ventana pierde su cara.
  assert.equal(bordes.TitleButtonBorder.lados.Top[0].grosor, 4);
  assert.equal(bordes.InsetBorder.lados.Left[0].grosor, 1);
});

test("pedir un borde por su alias devuelve el borde", () => {
  const f = { bordes, alias, colores: POR_DEFECTO.colores, fuentes: {} };
  assert.equal(bordeDe(f, "BaseBorder"), bordes.InsetBorder);
  assert.equal(bordeDe(f, "ButtonBorder"), bordes.RaisedBorder);
  assert.equal(bordeDe(f, "InsetBorder"), bordes.InsetBorder);
});

test("un alias que se muerde la cola no cuelga", () => {
  const f = { bordes: {}, alias: { A: "B", B: "A" }, colores: {}, fuentes: {} };
  assert.equal(bordeDe(f, "A"), null);
});

test("el bisel sale al revés en el hundido que en el que sobresale", () => {
  // Es todo el aspecto de VGUI2: un botón tiene el claro arriba-izquierda y un
  // desplegable lo tiene abajo-derecha. Si los dos salieran iguales, la ventana
  // se vería plana y no se notaría qué se puede pulsar.
  const f = { bordes, alias, colores: POR_DEFECTO.colores, fuentes: {} };
  const dentro = bordeCss(f, "InsetBorder");
  const fuera = bordeCss(f, "RaisedBorder");
  const claro = css(POR_DEFECTO.colores.BorderBright);
  const oscuro = css(POR_DEFECTO.colores.BorderDark);
  assert.ok(dentro.includes(`inset 1px 0 0 ${oscuro}`), dentro);   // izquierda oscura
  assert.ok(fuera.includes(`inset 1px 0 0 ${claro}`), fuera);      // izquierda clara
});

test("la pestaña elegida pierde la raya de abajo, y sólo ésa", () => {
  // Es la única diferencia visible entre la pestaña de delante y las de detrás,
  // porque el esquema les da a todas el mismo fondo (`ControlBG` y
  // `ControlDarkBG` valen los dos "0 0 0 128"). Sin esto la fila de pestañas
  // parece una hilera de botones.
  // Con el borde de repuesto, que tiene los cuatro lados: el de arriba en este
  // archivo sólo declara dos, y la prueba saldría verde sin comprobar nada.
  const entera = bordeCss(null, "InsetBorder");
  const sinAbajo = bordeCss(null, "InsetBorder", { sin: ["Bottom"] });
  assert.ok(entera.includes("inset 0 -1px 0"));
  assert.ok(!sinAbajo.includes("inset 0 -1px 0"));
  // Y no se lleva por delante los otros tres lados.
  assert.ok(sinAbajo.includes("inset 1px 0 0") && sinAbajo.includes("inset 0 1px 0"));
});

test("un borde que no existe no rompe el panel", () => {
  assert.equal(bordeCss(null, "NoExiste"), "none");
});

// ── LAS CADENAS ─────────────────────────────────────────────────────────────

test("una clave #GameUI_ se resuelve, y lo que no lleva # ya es texto", () => {
  // `gamemenu.res` mezcla las dos cosas: «Quit» es `#GameUI_GameMenu_Quit` y
  // «Visit a Kingdom» está escrito a pelo.
  const f = { cadenas: { "#GameUI_Cancel": "Cancel" } };
  assert.equal(texto(f, "#GameUI_Cancel"), "Cancel");
  assert.equal(texto(f, "Visit a Kingdom"), "Visit a Kingdom");
});

test("una clave que no está sale a la pantalla tal cual, como en el motor", () => {
  // Así el fallo se ve. Devolver "" dejaría un botón sin texto y nadie sabría
  // por qué.
  assert.equal(texto({ cadenas: {} }, "#GameUI_NoExiste"), "#GameUI_NoExiste");
});

// ── CONTRA EL ARCHIVO DE VERDAD ─────────────────────────────────────────────
//
// Estas sólo corren si `npm run vgui2` se ha pasado. Sin la ficha no fallan:
// el juego del que salen no se versiona.

test("el esquema horneado trae lo que las ventanas piden", { skip: !ficha }, () => {
  for (const n of ["BaseText", "SelectionBG", "ListBG", "BorderBright", "BorderDark", "TitleBG"]) {
    assert.ok(ficha.colores[n], `falta el color ${n}`);
  }
  for (const n of ["Default", "DefaultSmall", "Marlett"]) {
    assert.ok(ficha.fuentes[n]?.length, `falta la fuente ${n}`);
  }
  assert.ok(ficha.bordes.RaisedBorder && ficha.bordes.InsetBorder);
});

test("las cadenas de las pestañas de Options están, y dicen lo de la captura", { skip: !ficha }, () => {
  assert.equal(ficha.cadenas["#GameUI_ReverseMouseLabel"], "Reverse mouse up-down axis");
  assert.equal(ficha.cadenas["#GameUI_MouseFilterLabel"], "Smooth out mouse movement");
  assert.equal(ficha.cadenas["#GameUI_PlayerName"], "Player name");
});

test("la barra de título del juego es transparente de verdad", { skip: !ficha }, () => {
  // No es una interpretación: el archivo pone el alfa a 0 y en la captura no hay
  // banda de título. Es la prueba que fija que el alfa va al derecho contra el
  // archivo de verdad, no contra uno de mentira.
  assert.deepEqual(ficha.colores.TitleBG, [206, 206, 206, 0]);
  assert.equal(css(ficha.colores.TitleBG), "rgba(206,206,206,0.000)");
});

test("EngineFont trae los cinco tamaños por altura de pantalla", { skip: !ficha }, () => {
  const conRango = ficha.fuentes.EngineFont.filter((f) => f.yres);
  assert.equal(conRango.length, 5);
  assert.equal(fuenteDe(ficha, "EngineFont", 1080).alto, 20);
});

test("LA LETRA DE LOS DIÁLOGOS NO ESCALA, y la del motor sí", { skip: !ficha }, () => {
  // Son dos fuentes distintas y es fácil confundirlas, porque están en el mismo
  // archivo. `Default` —la de «Options» y «Servers»— no tiene `yres`: mide 13
  // a cualquier resolución, y por eso la ventana ocupa lo mismo en la captura de
  // 1440 que en la de 800. `EngineFont` sí tiene cinco rangos, pero es la del
  // texto del motor, no la de los diálogos.
  //
  // Lo encontró la sonda: pedía 14 px y salían 13.
  assert.equal(fuenteDe(ficha, "Default", 480).alto, fuenteDe(ficha, "Default", 1080).alto);
  assert.notEqual(fuenteDe(ficha, "EngineFont", 480).alto, fuenteDe(ficha, "EngineFont", 1080).alto);
});

// ── LOS AJUSTES ─────────────────────────────────────────────────────────────

test("las siete pestañas están, y en el orden de la captura", () => {
  assert.deepEqual(PESTANAS,
    ["Multiplayer", "Keyboard", "Mouse", "Audio", "Video", "Voice", "Lock"]);
});

test("LOS VALORES POR DEFECTO SALEN DEL config.cfg DEL JUEGO", { skip: !CFG }, () => {
  // Ésta es la prueba que importa de toda la pestaña: que ningún número se ha
  // elegido a ojo. Cada ajuste que declara una línea del `config.cfg` tiene que
  // encontrarla en el archivo de verdad.
  const faltan = [];
  for (const a of AJUSTES) {
    if (!a.cfg) continue;
    if (!CFG.includes(a.cfg)) faltan.push(`${a.clave}: ${a.cfg}`);
  }
  assert.deepEqual(faltan, [], `no están en el config.cfg:\n  ${faltan.join("\n  ")}`);
});

test("la sensibilidad por defecto es la del archivo, y es la de la captura", { skip: !CFG }, () => {
  // `sensitivity "10"` en el `config.cfg` y `10.0` escrito en la cajita de la
  // captura de la pestaña Mouse. Que coincidan es lo que demuestra que la
  // escala 0.20–20.00 medida de la captura es la buena y no una inventada.
  assert.match(CFG, /sensitivity\s+"10"/);
  assert.equal(ajuste("sensibilidad").pordefecto, 10);
  assert.equal(ajuste("sensibilidad").min, 0.2);
  assert.equal(ajuste("sensibilidad").max, 20);
});

test("cada ajuste apagado dice POR QUÉ, y ninguno se calla", () => {
  // Un control apagado sin motivo es peor que no tenerlo: el jugador no sabe si
  // está roto o si no existe. Y a nosotros se nos olvida qué falta.
  for (const a of AJUSTES) {
    if (!a.porQueNo) continue;
    assert.equal(typeof a.porQueNo, "string");
    assert.ok(a.porQueNo.length > 20, `el motivo de ${a.clave} no explica nada`);
  }
});

// ── «CREATE SERVER»: NINGÚN AJUSTE SE CALLA ─────────────────────────────────
//
// Esta es la prueba que faltaba y la que habría cazado el fallo. `porQueNo`
// vacío significaba «esto hace algo» y no lo comprobaba nadie, así que `mapa` y
// `nombre` pasaron por vivos sin llegar al juego: `alEmpezar` sólo miraba
// `pantallaCompleta`. La cuenta decía tres y era uno.
//
// Es la misma forma de fallo que los tres controles verdes del 35, del agua y
// de los retratos: **el valor de reposo pasando la prueba**. Aquí el reposo era
// «no pone `porQueNo`».

// LAS DOS TABLAS, CON LA MISMA REGLA — el 85.
//
// `src/play/ajustes.js` tenía 21 filas con `porQueNo` y **cero** con `aplica`:
// o sea que el lado que dice «esto hace algo» seguía siendo un campo vacío,
// que es exactamente lo que esta prueba vino a cerrar en la otra tabla. Y el
// 84 enseñó que la frase no basta: `aplicarAjustes` nace `null` y lo escribe
// el armado del mundo, así que mover el volumen en el menú principal no hacía
// nada mientras la función que lo reparte existía, se llamaba y funcionaba —en
// el único estado en el que el jugador no estaba. Un `aplica` que sólo nombre
// una función no puede ver eso.
//
// Así que se comprueban las tres piezas: que la línea citada EXISTE en el
// archivo que dice (si alguien la renombra, esto se pone rojo en vez de
// envejecer), que el control citado existe en la sonda que dice, y que un
// ajuste vivo sin control lo declare `pendiente` en vez de contarse entre los
// verdes, que es lo que pide el apartado 4 de CLAUDE.md.
const TABLAS = [["Options", AJUSTES.filter((a) => a.tipo !== "nota")], ["Create Server", AJUSTES_CS]];

for (const [nombre, filas] of TABLAS) {
  test(`en «${nombre}» todo ajuste o dice por qué no, o dice dónde se aplica`, () => {
    for (const a of filas) {
      const callado = !a.porQueNo && !a.aplica;
      assert.ok(!callado,
        `«${a.clave}» no dice ni por qué no hace nada ni dónde se aplica: ` +
        `o se le pone \`porQueNo\`, o se le pone \`aplica\` y se enchufa de verdad`);
      assert.ok(!(a.porQueNo && a.aplica),
        `«${a.clave}» dice las dos cosas a la vez: o no hace nada, o se aplica`);
      if (a.porQueNo) assert.ok(a.porQueNo.length > 20, `el motivo de ${a.clave} no explica nada`);
      if (!a.aplica) continue;
      assert.ok(a.aplica.donde?.length > 20, `el \`aplica\` de ${a.clave} no dice dónde`);
      assert.ok(a.aplica.codigo?.length, `el \`aplica\` de ${a.clave} no cita ninguna línea`);
      // O lo mide alguien, o se declara pendiente. Las dos cosas a la vez no:
      // «hay un control» y «no hay ninguno» no pueden ser verdad del mismo.
      const medido = Boolean(a.aplica.llega?.length);
      assert.ok(medido !== Boolean(a.aplica.pendiente),
        `«${a.clave}»: o \`llega\` con el control que lo mide, o \`pendiente\` con por qué no`);
      if (!medido) {
        assert.ok(a.aplica.pendiente.length > 40,
          `el \`pendiente\` de ${a.clave} no dice qué falta por medir`);
      }
    }
  });

  test(`y en «${nombre}» la línea que aplica cada ajuste SIGUE ESTANDO`, () => {
    // Ésta es la que no envejece sola. Un `aplica` en prosa se queda escrito
    // igual de bonito el día que alguien renombre `raton.poner` o se lleve la
    // línea del menú, y entonces vuelve a ser un campo que dice «esto
    // funciona» sin que nadie lo haya comprobado — el 84 otra vez.
    const leido = new Map();
    const lee = (ruta) => {
      if (!leido.has(ruta)) leido.set(ruta, existsSync(ruta) ? readFileSync(ruta, "utf8") : null);
      return leido.get(ruta);
    };
    const faltan = [];
    for (const a of filas) {
      for (const [ruta, trozo] of a.aplica?.codigo ?? []) {
        const src = lee(ruta);
        if (src === null) { faltan.push(`${a.clave}: no está el archivo ${ruta}`); continue; }
        if (!src.includes(trozo)) faltan.push(`${a.clave}: ${ruta} ya no lleva «${trozo}»`);
      }
      for (const [ruta, queDice] of a.aplica?.llega ?? []) {
        const src = lee(ruta);
        if (src === null) { faltan.push(`${a.clave}: no está la sonda ${ruta}`); continue; }
        if (!src.includes(queDice)) faltan.push(`${a.clave}: ${ruta} ya no tiene el control «${queDice}»`);
      }
    }
    assert.deepEqual(faltan, [], `citas que ya no valen:\n  ${faltan.join("\n  ")}`);
  });
}

test("y los ajustes vivos SIN control de llegada son exactamente éstos", () => {
  // Escrita a mano a propósito, como la de «Create Server» de más abajo y por
  // lo mismo: una lista calculada volvería a estar de acuerdo consigo misma.
  // Quien mida uno de éstos tiene que venir aquí a borrarlo de la lista, y
  // quien encienda un ajuste nuevo sin medirlo tiene que venir a ponerlo.
  //
  // Los cuatro, con su motivo en la tabla:
  //
  //   `filtro`      nadie pulsa la casilla, y su reposo es `true`
  //   `volumenMp3`  nadie arrastra el deslizador de la música: los dos
  //                 controles que la nombran comprueban que sigue en su 0,2
  //   `gamma`       el deslizador que se arrastra en Video es el del brillo
  //   `teclas`      se reasigna por la API y no pulsando la tabla
  assert.deepEqual(cuenta().pendientes.sort(),
    ["filtro", "gamma", "teclas", "volumenMp3"]);
  assert.equal(cuenta().medidos + cuenta().pendientes.length, cuenta().vivos);
  // Y en «Create Server», la casilla de pantalla completa: lo que `pantalla38`
  // mide es el mismo efecto por la tecla B, que no pasa por esa fila.
  assert.deepEqual(cuentaCS().pendientes, ["pantallaCompleta"]);
});

test("el volumen declara LOS DOS caminos, que es el fallo del 84", () => {
  // No es un ajuste cualquiera: es el que demuestra que «dónde se aplica» no
  // es una línea. El deslizador del volumen sale por dos sitios —los `Audio`
  // del menú y el nodo de Web Audio— y el jugador lo mueve primero en el
  // estado donde sólo existe el primero. Si alguien deja esto en un camino,
  // el otro se queda sin decir y vuelve a poderse romper en silencio.
  const a = ajuste("volumen").aplica;
  const rutas = a.codigo.map(([r]) => r);
  assert.ok(rutas.includes("src/juego/menums.js"),
    "falta el camino del menú: el volumen de los `Audio` del DOM");
  assert.ok(a.codigo.some(([, t]) => t.includes("ponVolumen")),
    "falta la línea que reparte el volumen cuando todavía no hay mapa");
  // Y el control que lo mide SIN MAPA, que es la mitad que no puede dar el
  // resto de la sonda: `sondas/ajustes37.mjs` entra en la partida para medir.
  assert.ok(a.llega.some(([r]) => r === "sondas/menu52.mjs"),
    "nadie lo mide en el menú principal, que es donde estaba el fallo");
});

test("y los que dicen estar vivos son EXACTAMENTE los que están enchufados", () => {
  // Escrita a mano a propósito: si alguien enciende un ajuste, esta lista le
  // obliga a venir aquí y a mirar si de verdad lo enchufó. Una lista calculada
  // volvería a estar de acuerdo consigo misma, que es justo lo que pasó.
  const vivos = AJUSTES_CS.filter((a) => !a.porQueNo).map((a) => a.clave).sort();
  assert.deepEqual(vivos, ["mapa", "pantallaCompleta"]);
  // Trece, no doce: doce son los de la captura y el decimotercero es
  // «Play in full screen», que es nuestro y se declara como tal.
  const c = cuentaCS();
  assert.equal(c.total, 13);
  assert.equal(c.vivos, 2);
  assert.equal(c.apagados, 11);
  assert.equal(AJUSTES_CS.filter((a) => a.nuestra).length, 1);
});

test("«Store Characters» y «Max. players» ya no dan un motivo falso", () => {
  // Los dos decían que faltaba algo que SÍ existe. El motivo bueno es el mismo
  // para los dos y es uno solo: «Start» no levanta un servidor.
  const guardar = ajusteCS("guardarPersonajes").porQueNo;
  assert.ok(!/there is no server/i.test(guardar), "vuelve a decir que no hay servidor");
  assert.match(guardar, /AlmacenRemoto/);
  const max = ajusteCS("maxJugadores").porQueNo;
  assert.ok(!/accounts/i.test(max), "vuelve a echarle la culpa a las cuentas");
  assert.match(max, /server process/);
});

test("la cuenta de lo que funciona se calcula, no se escribe", () => {
  const c = cuenta();
  assert.equal(c.vivos + c.apagados, c.total);
  assert.ok(c.vivos > 0 && c.vivos < c.total);
  // La pestaña de las teclas es la que está entera: es la única que ya existía.
  assert.equal(c.porPestana.Keyboard.vivos, c.porPestana.Keyboard.total);
  // Y Voice no tiene nada, porque no hay canal de voz en el protocolo.
  assert.equal(c.porPestana.Voice.vivos, 0);
});

test("las etiquetas #GameUI_ existen de verdad en el archivo del juego", { skip: !ficha }, () => {
  // Una clave mal escrita no falla: sale el `#GameUI_LoQueSea` en la ventana.
  // Por eso se comprueba aquí y no mirando la pantalla.
  const malas = [];
  for (const a of AJUSTES) {
    for (const k of [a.etiqueta, a.descripcion]) {
      if (typeof k === "string" && k.startsWith("#") && !ficha.cadenas[k]) malas.push(k);
    }
  }
  assert.deepEqual(malas, [], `claves que no están en gameui_english.txt: ${malas.join(", ")}`);
});

// ── EL GUARDADO DE LOS AJUSTES ──────────────────────────────────────────────

test("un guardado que no trae ajustes deja los del config.cfg", () => {
  // La lección del 33: el guardado cambia de forma y lo viejo tiene que leerse.
  assert.deepEqual(leerAjustes(undefined), porDefecto());
  assert.deepEqual(leerAjustes(null), porDefecto());
  assert.deepEqual(leerAjustes({}), porDefecto());
});

test("un ajuste que sobra en el guardado se tira sin quejarse", () => {
  const v = leerAjustes({ sensibilidad: 4, ajusteDeOtraVersion: "lo que sea" });
  assert.equal(v.sensibilidad, 4);
  assert.equal(v.ajusteDeOtraVersion, undefined);
});

test("un número fuera de rango se RECORTA, no se tira", () => {
  // Un guardado con la sensibilidad a 900 tiene que dejar jugar. Volver al 10
  // en silencio le quitaría al jugador un ajuste suyo sin decírselo.
  assert.equal(leerAjustes({ sensibilidad: 900 }).sensibilidad, 20);
  assert.equal(leerAjustes({ sensibilidad: -5 }).sensibilidad, 0.2);
});

test("un número que no es un número no rompe nada", () => {
  assert.equal(leerAjustes({ sensibilidad: "ocho y medio" }).sensibilidad, 10);
  assert.equal(leerAjustes({ volumen: NaN }).volumen, 0.12);
});

test("una casilla guardada como 0 o 1 se lee como casilla", () => {
  assert.equal(leerAjustes({ filtro: 0 }).filtro, false);
  assert.equal(leerAjustes({ filtro: 1 }).filtro, true);
});

// ── «CREATE SERVER» ─────────────────────────────────────────────────────────

test("las dos pestañas de Create Server, en el orden de la captura", () => {
  assert.deepEqual(PESTANAS_CS, ["Server", "Game"]);
});

test("TRES CASILLAS CUADRAN CON LOS CVARS DEL MOD, y por eso me fío del resto", () => {
  // `ms_allowtimevote` vale 1 y en la captura sale MARCADA; `ms_pklevel` vale 0
  // y sale sin marcar; `ms_central_enabled` vale 0 y sale sin marcar. Tres de
  // tres. Es lo que permite portar los demás sin haberlos podido comprobar uno
  // a uno.                                       svglobals.cpp:42, 51, 67
  assert.equal(ajusteCS("votarHora").pordefecto, true);
  assert.equal(ajusteCS("pvp").pordefecto, false);
  assert.equal(ajusteCS("central").pordefecto, false);
});

test("el que NO cuadra lleva escrito que no cuadra", () => {
  // `ms_reset_time` vale 10 (svglobals.cpp:45) y la ventana enseña 30. Manda lo
  // que ve el jugador, y el cvar queda apuntado al lado en vez de taparse.
  const a = ajusteCS("reiniciarTras");
  assert.equal(a.pordefecto, 30);
  assert.match(a.fuente, /ms_reset_time.*10/);
  assert.match(a.fuente, /30/);
});

test("la fila que es NUESTRA está declarada como nuestra", () => {
  // La pantalla completa no es de Master Sword y no puede serlo. Misma regla que
  // ALT y ALT GR en `teclas.js`: lo leído y lo decidido se distinguen.
  const a = ajusteCS("pantallaCompleta");
  assert.equal(a.nuestra, true);
  assert.equal(a.cvar, undefined);
  // Y las del juego NO llevan esa marca, que es la otra mitad de la prueba.
  assert.equal(ajusteCS("central").nuestra, undefined);
  assert.equal(AJUSTES_CS.filter((x) => x.nuestra).length, 1);
});

test("la lista de mapas dice la verdad: los portados y el rótulo", () => {
  // El original lista los ciento y pico `.bsp` del juego. Enseñarlos aquí sería
  // una lista de nombres que no abren.
  //
  // CORRECCIÓN DEL 50: esto decía «sólo hay uno portado» y lo comprobaba con
  // un `["< Random Map >", "gatecity"]` escrito y un `length === 1`. Al entrar
  // Edana se puso rojo diciendo que la lista mentía, y la que había envejecido
  // era la prueba. La cuenta se calcula: lo que importa es que la ventana
  // enseñe **lo que `MAPAS_PORTADOS` promete, con el rótulo delante y nada
  // más**, que es lo que seguirá haciendo falta con el tercero.
  assert.deepEqual(MAPAS, ["< Random Map >", ...MAPAS_PORTADOS]);
  assert.equal(MAPAS.filter((m) => !m.startsWith("<")).length, MAPAS_PORTADOS.length);
  // Y el rótulo va delante y es el único que no es un mapa.
  assert.equal(MAPAS.filter((m) => m.startsWith("<")).length, 1);
  assert.ok(MAPAS[0].startsWith("<"));
});

test("«< Random Map >» elige entre los que existen, no devuelve el rótulo", () => {
  // CORRECCIÓN DEL 50: esto exigía `"gatecity"` a un sorteo. Con un mapa
  // portado el sorteo tenía una sola bola y la prueba pasaba siempre; con dos
  // es cara o cruz, o sea una prueba que falla la mitad de las veces sin que
  // nada esté roto. Lo que se puede afirmar de un sorteo es **de dónde salen
  // las bolas**, y que no sale el rótulo.
  for (let i = 0; i < 200; i++) {
    for (const v of ["< Random Map >", "", null, undefined]) {
      const m = mapaElegido(v);
      assert.ok(MAPAS_PORTADOS.includes(m), `«${m}» no está en MAPAS_PORTADOS`);
    }
  }
  // CONTROL POSITIVO: y con dos bolas el sorteo SORTEA. Sin esto, «sale uno de
  // los portados» estaría verde con un `return reales[0]` que no sortea nada.
  // Con un solo mapa portado no se puede preguntar, y se dice en vez de
  // fingir que se comprobó.
  if (MAPAS_PORTADOS.length > 1) {
    const vistos = new Set();
    for (let i = 0; i < 500; i++) vistos.add(mapaElegido("< Random Map >"));
    assert.equal(vistos.size, MAPAS_PORTADOS.length,
      `en 500 sorteos salieron ${[...vistos].join(", ")}`);
  }
  // Pedir uno por su nombre no sortea: devuelve ése, sea cual sea.
  for (const m of MAPAS_PORTADOS) assert.equal(mapaElegido(m), m);
  // Y un mapa que no está no cuelga el «Start»: cae en el primero de verdad.
  assert.equal(mapaElegido("aluhandra2"), MAPAS_PORTADOS[0]);
});

test("sin ningún mapa de verdad, «Start» no promete nada", () => {
  assert.equal(mapaElegido("< Random Map >", ["< Random Map >"]), null);
});

// ── LAS DOS VENTANAS, lo que se puede comprobar sin navegador ───────────────

test("la ventana de servidores trae las seis pestañas de la captura", () => {
  assert.deepEqual(PESTANAS_SRV,
    ["Internet", "Favorites", "History", "Spectate", "Lan", "Friends"]);
});

test("las dos columnas sin nombre de la lista existen igual", () => {
  // El candado y el corazón. Hoy vienen vacías, pero si no fueran columnas la
  // cabecera quedaría descolocada respecto a las filas.
  assert.equal(COLUMNAS.length, 7);
  assert.equal(COLUMNAS[0].titulo, "");
  assert.equal(COLUMNAS[1].titulo, "");
  assert.equal(COLUMNAS[2].titulo, "Servers");
});
