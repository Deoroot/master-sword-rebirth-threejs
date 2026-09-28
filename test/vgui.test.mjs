// EL KIT DE VGUI, comprobado sin navegador.
//
// Lo que se puede comprobar leyendo: el esquema de fuentes, la inversión del
// alfa, las nueve alineaciones, la cuenta del desvanecido, las dos funciones de
// centrado —la buena y la que tiene el fallo de precedencia—, el reparto de
// teclas con su botón inalcanzable, y las opciones que salen de los scripts.
//
// Lo que NO se puede y va en `sondas/vgui29.mjs`: que el panel se vea, que la F
// lo abra de verdad y que con él delante el jugador no se mueva.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { leerEsquemas, testigos, resolucionPara } from "../tools/vgui.mjs";
import { tipoDe, juzgar, bloqueDe, opcionesDe as leerOpciones, envoltorio } from "../tools/menus.mjs";
import { Esquema, pilaDe } from "../src/vgui/esquema.js";
import { flexDe, ALINEACION, opacidadDeFondo } from "../src/vgui/widgets.js";
import { centrado, centradoConFallo, COLORES, MEDIDAS } from "../src/vgui/menubase.js";
import { Registro, PanelConNombre, ATRAPA_NUMEROS, CERRAR_CON_ESC, ATRAPA_RUEDA, DESVANECIDO, TRAGA_USAR, RUEDA } from "../src/vgui/registro.js";
import { opcionesDe, llevaObjeto, costeDe, puedePagar, opcionesDelJugador } from "../src/play/opciones.js";
import { ACCIONES, porDefecto } from "../src/juego/teclas.js";
import { deVgui } from "../src/juego/paleta.js";

// ── 1. EL ESQUEMA ───────────────────────────────────────────────────────────

test("el esquema de fuentes", async (t) => {
  const ESQUEMA = `
// un comentario que no cuenta
SchemeName = "Briefing Text"
FontName = "Sitka"
FontSize = 14
FgColor = "255 170 0 255"
SchemeName = "ID Text"
FontName = "Sitka"
FontSize = 14
FontWeight = 500`;

  await t.test("los testigos: lo que va entre comillas es UNO", () => {
    // Sin esto `"Primary Button Text"` serían tres nombres de esquema.
    const t2 = testigos(`SchemeName = "Primary Button Text" // y esto no`);
    assert.deepEqual(t2, ["SchemeName", "=", "Primary Button Text"]);
  });

  await t.test("la cascada de colores se aplica al abrir el SIGUIENTE esquema", () => {
    const e = leerEsquemas(ESQUEMA);
    assert.equal(e["Briefing Text"].tamano, 14);
    assert.deepEqual(e["Briefing Text"].fg, [255, 170, 0, 255]);
    // Al no declarar el armado, se copia el normal.
    assert.deepEqual(e["Briefing Text"].fgArmado, [255, 170, 0, 255]);
    assert.deepEqual(e["Briefing Text"].bg, [0, 0, 0, 0]);
  });

  await t.test("EL FALLO: el último esquema del archivo se queda sin cascada", () => {
    // `if (pScheme) { ...defaults... }` sólo corre al leer un `SchemeName`
    // nuevo, y después del bucle no hay un último volcado
    // (vgui_schememanager.cpp:239-282 y :357). O sea que «ID Text», que es el
    // último de los cuatro archivos del juego, no recibe nunca su blanco.
    const conFallo = leerEsquemas(ESQUEMA);
    const sinFallo = leerEsquemas(ESQUEMA, { conFallos: false });
    assert.equal(conFallo["ID Text"].fg, null, "con el fallo se queda sin color");
    assert.deepEqual(sinFallo["ID Text"].fg, [255, 255, 255, 255], "sin el fallo le toca blanco");
    // Y el que no es el último sí la recibe en los dos casos: la diferencia es
    // sólo del último, no del lector entero.
    assert.deepEqual(conFallo["Briefing Text"].fgArmado, sinFallo["Briefing Text"].fgArmado);
  });

  await t.test("EL OTRO FALLO: `BorderColor` marca la variable de otro color", () => {
    // `ParseRGBAFromString(pScheme->borderColor, ...); hasMouseDownBgColor = true;`
    //                                     vgui_schememanager.cpp:342-346
    const con = leerEsquemas(`
SchemeName = "Con borde"
BgColor = "10 20 30 40"
BorderColor = "1 2 3 4"
SchemeName = "El ultimo"
FontSize = 9`);
    const sin = leerEsquemas(`
SchemeName = "Con borde"
BgColor = "10 20 30 40"
BorderColor = "1 2 3 4"
SchemeName = "El ultimo"
FontSize = 9`, { conFallos: false });
    // Con el fallo, `bgPulsado` se queda sin heredar de `bgArmado`.
    assert.equal(con["Con borde"].bgPulsado, null);
    assert.deepEqual(sin["Con borde"].bgPulsado, [10, 20, 30, 40]);
  });

  await t.test("qué archivo elige el motor para cada ancho de pantalla", () => {
    assert.equal(resolucionPara(640), 640);
    assert.equal(resolucionPara(1439), 960, "no interpola: usa el de 960 tal cual");
    assert.equal(resolucionPara(1440), 1440);
    assert.equal(resolucionPara(3840), 1920, "por arriba se queda en el mayor");
    assert.equal(resolucionPara(639), null, "por debajo de 640 no hay archivo");
  });

  await t.test("y sin el fichero el esquema funciona igual", () => {
    // La regla del HUD y del menú: un `.json` que falta no puede dejar al
    // jugador sin interfaz. Un panel sin letra es un panel invisible.
    const e = new Esquema(null, 1920);
    assert.match(e.fuenteCss("Briefing Text"), /Sitka/);
    assert.match(e.fuenteCss("Title Font"), /23px/);
    assert.equal(e.color("Title Font", "fg"), deVgui(255, 170, 0, 255));
    // `resolucionPara` de socorro devuelve 640 en vez de null, que es lo único
    // que cambia respecto al motor: él se queda con «Arial».
    assert.equal(new Esquema(null, 320).resolucion, 640);
  });

  await t.test("y el fallo del motor NO deja el texto invisible aquí", () => {
    // «ID Text» no trae color por el fallo. El motor pinta con lo que hubiera en
    // memoria —negro transparente— y el texto no se ve. Eso no se copia.
    const e = new Esquema(null, 640);
    assert.equal(e.sinColor("ID Text"), true, "el esquema sigue sin color, como el original");
    assert.equal(e.color("ID Text"), deVgui(255, 255, 255, 0), "pero se pinta blanco, no nada");
  });

  await t.test("el peso de Windows se recorta al de CSS", () => {
    // `FontWeight = 1400` es «very bold» según el propio archivo del juego, y en
    // CSS el máximo es 900.
    const e = new Esquema({ resoluciones: [640], esquemas: { 640: { X: { fuente: "Sitka", tamano: 12, peso: 1400 } } } }, 640);
    assert.match(e.fuenteCss("X"), /^900 12px/);
    assert.equal(pilaDe("Sitka").includes("Sitka Text"), true);
    assert.equal(pilaDe("lo que sea").includes("Sitka"), true, "lo desconocido cae en la pila del juego");
  });

  if (existsSync("build/gatecity/vgui.json")) {
    await t.test("y contra el fichero de verdad: los tamaños NO van en orden", () => {
      // El hallazgo de los datos del propio juego: el archivo de 1440 pone 21
      // donde el de 1920 pone 16, o sea que a 1440 el texto del cuerpo se ve MÁS
      // GRANDE que a 1920. No es un error de lectura y no se arregla.
      const f = JSON.parse(readFileSync("build/gatecity/vgui.json", "utf8"));
      const c = [640, 960, 1440, 1920].map((r) => f.esquemas[r]["Briefing Text"].tamano);
      assert.deepEqual(c, [14, 14, 21, 16]);
      assert.ok(c[2] > c[3], "el de 1440 es el mayor de los cuatro");
    });
  }
});

// ── 2. EL ALFA, LAS ALINEACIONES Y EL CENTRADO ──────────────────────────────

test("el aspecto: el alfa al revés y las nueve alineaciones", async (t) => {
  await t.test("`setBgColor(0,0,0,255)` no es negro: es NADA", () => {
    assert.equal(deVgui(0, 0, 0, 255), "rgba(0, 0, 0, 0.000)");
    assert.equal(deVgui(255, 170, 0, 0), "rgb(255, 170, 0)", "alfa 0 es OPACO");
  });

  await t.test("`m_iTransparency`: 0 y 255 son los dos invisibles", () => {
    // 0 porque `if (m_iTransparency)` no dibuja, y 255 porque el negro con alfa
    // 255 en VGUI es transparente. El medio negro de la ventana es 128.
    assert.equal(opacidadDeFondo(0), 0);
    assert.equal(opacidadDeFondo(255), 0);
    assert.equal(opacidadDeFondo(128), (255 - 128) / 255);
    // Y la prueba de que la convención es ésta: el desvanecido va de 255 a 128,
    // o sea de nada a medio. Con el alfa al derecho iría de negro macizo a medio,
    // que sería un fogonazo negro al abrir el menú.
    assert.ok(opacidadDeFondo(255) < opacidadDeFondo(128), "el menú ENTRA, no parpadea");
  });

  await t.test("las nueve alineaciones, en su orden", () => {
    assert.equal(ALINEACION.length, 9);
    assert.equal(ALINEACION[0], "northwest");
    assert.equal(ALINEACION[4], "center");
    assert.equal(ALINEACION[5], "east", "la quinta es `a_east`, con la que arranca MSButton");
    assert.deepEqual(flexDe(4), { justify: "center", align: "center", nombre: "center" });
    assert.deepEqual(flexDe("southeast"), { justify: "flex-end", align: "flex-end", nombre: "southeast" });
    assert.deepEqual(flexDe(0), { justify: "flex-start", align: "flex-start", nombre: "northwest" });
  });

  await t.test("EL FALLO DE PRECEDENCIA de `GetCenteredItemX`", () => {
    // `ItemSizeX/2 * Items + (Space/2 * Items - 1)` en vez de
    // `... + Space/2 * (Items - 1)`. El `-1` está fuera del paréntesis que le
    // tocaba (vgui_choosecharacter.cpp:396).
    //
    // Con una cosa y sin espacio —el título del menú— sale un píxel a la
    // derecha:
    assert.equal(centrado(120, 40), 40);
    assert.equal(centradoConFallo(120, 40, 1, 0), 41);
    // Y con varias cosas y espacio de verdad el error es de medio hueco por
    // cosa, que ya se ve: tres cosas de 20 con 10 de hueco en 200 de ancho.
    assert.equal(centradoConFallo(200, 20, 3, 10), 100 - (30 + 14));
    assert.notEqual(centradoConFallo(200, 20, 3, 10), 100 - (30 + 10));
  });

  await t.test("los colores del menú son los del juego, no elegidos", () => {
    assert.deepEqual(COLORES.armado, [255, 0, 0, 0], "el armado es ROJO");
    assert.deepEqual(COLORES.desarmado, [255, 178, 0, 0], "y el normal ÁMBAR");
    assert.deepEqual(COLORES.borde, [100, 140, 100, 255]);
    assert.equal(MEDIDAS.anchoVentana, 120);
    assert.equal(MEDIDAS.altoVentana, 170);
  });
});

// ── 3. EL REPARTO DE TECLAS ─────────────────────────────────────────────────

/** Un panel de mentira, para poder comprobar el reparto sin DOM. */
class Espia extends PanelConNombre {
  constructor(nombre, banderas, sinRaton = false) {
    super({ nombre, banderas, sinRaton });
    this.ranuras = [];
    this.pasos = [];
  }
  ranura(i) { this.ranuras.push(i); return true; }
  paso(c) { this.pasos.push(c); }
}

test("el reparto de teclas lo hace el registro, no el panel", async (t) => {
  const esquema = new Esquema(null, 640);
  let ahora = 0;
  const hacer = () => new Registro({ esquema, reloj: () => ahora });

  await t.test("sin panel abierto no se queda con nada", () => {
    const r = hacer();
    r.poner(new Espia("x", ATRAPA_NUMEROS | CERRAR_CON_ESC));
    assert.equal(r.tecla("Digit1"), false);
    assert.equal(r.tecla("Escape"), false);
    assert.equal(r.rueda(RUEDA.ARRIBA), false);
  });

  await t.test("soltar una tecla no hace nada: `if (!down) return 1;`", () => {
    const r = hacer();
    const p = r.poner(new Espia("x", ATRAPA_NUMEROS));
    r.abrir("x");
    assert.equal(r.tecla("Digit3", false), false);
    assert.deepEqual(p.ranuras, []);
    assert.equal(r.tecla("Digit3", true), true);
    assert.deepEqual(p.ranuras, [2]);
  });

  await t.test("EL BOTÓN DÉCIMO NO SE PUEDE ELEGIR CON EL TECLADO", () => {
    // `SlotInput((i - '0') - 1)` para i de '0' a '9'
    // (vgui_teamfortressviewport.cpp:1892-1901): el `1` da la ranura 0 y el `9`
    // la 8. El `0` da **−1**, que `SlotInput` rechaza. Y el menú de interacción
    // crea DIEZ botones, así que el décimo sólo se pulsa con el ratón.
    //
    // Doce líneas más arriba, en el camino del menú del HUD, el mismo motor sí
    // hace `if (!Num) Num = 10;`. O sea que la corrección existe y no se aplicó
    // aquí. Se porta con el fallo.
    const r = hacer();
    const p = r.poner(new Espia("x", ATRAPA_NUMEROS));
    r.abrir("x");
    for (const d of "0123456789") r.tecla(`Digit${d}`);
    assert.deepEqual(p.ranuras, [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(!p.ranuras.includes(9), "ninguna tecla da la ranura 9");
    // Y se la queda igualmente: el motor hace `return 0` aunque la ranura sea −1,
    // así que el `0` no llega al juego tampoco.
    assert.equal(r.tecla("Digit0"), true);
  });

  await t.test("Escape cierra sólo si lleva la bandera", () => {
    const r = hacer();
    r.poner(new Espia("con", CERRAR_CON_ESC));
    r.poner(new Espia("sin", ATRAPA_NUMEROS));
    r.abrir("sin");
    assert.equal(r.tecla("Escape"), false);
    assert.ok(r.abierto, "sigue abierto");
    r.cerrar();
    r.abrir("con");
    assert.equal(r.tecla("Escape"), true);
    assert.equal(r.abierto, null);
  });

  await t.test("la rueda es del panel, y al HUD no llega si hay panel", () => {
    const r = hacer();
    const con = r.poner(new Espia("con", ATRAPA_RUEDA));
    r.poner(new Espia("sin", 0));
    r.abrir("con");
    assert.equal(r.rueda(RUEDA.ABAJO), true);
    assert.deepEqual(con.pasos, [RUEDA.ABAJO]);
    r.abrir("sin");
    // Sin la bandera el panel no la usa, pero el registro se la queda: el motor
    // sólo llama a `HUD_StepInput` cuando NO hay menú (`else if (!m_pCurrentMenu)`).
    assert.equal(r.rueda(RUEDA.ABAJO), true);
  });

  await t.test("`m_NoMouse`: hay paneles que se leen sin soltar el ratón", () => {
    // `CStatPanel` es así (vgui_stats.cpp:75). Copiarlo al revés daría una hoja
    // de personaje que te quita la cámara.
    const r = hacer();
    r.poner(new Espia("hoja", CERRAR_CON_ESC, true));
    r.poner(new Espia("inv", CERRAR_CON_ESC, false));
    r.abrir("hoja");
    assert.equal(r.atrapaElRaton, false);
    r.abrir("inv");
    assert.equal(r.atrapaElRaton, true);
  });

  await t.test("hay UN panel abierto, no una pila", () => {
    const r = hacer();
    const a = r.poner(new Espia("a", 0)), b = r.poner(new Espia("b", 0));
    r.abrir("a");
    r.abrir("b");
    assert.equal(a.visible, false, "abrir el segundo cierra el primero");
    assert.equal(b.visible, true);
    assert.equal(r.abierto, b);
  });

  await t.test("al cerrar, la tecla de usar se traga medio segundo", () => {
    // `if ((cmd->buttons & IN_USE) && ((time - g_fMenuLastClosed) < 0.5f))`
    //                                     input.cpp:859-863
    const r = hacer();
    r.poner(new Espia("x", 0));
    ahora = 10;
    r.abrir("x");
    r.cerrar();
    assert.equal(r.tragaUsar(), true);
    ahora = 10 + TRAGA_USAR - 0.01;
    assert.equal(r.tragaUsar(), true);
    ahora = 10 + TRAGA_USAR + 0.01;
    assert.equal(r.tragaUsar(), false);
  });

  await t.test("el desvanecido dura medio segundo y va de 0 a 1", () => {
    const r = hacer();
    const p = r.poner(new Espia("x", 0));
    ahora = 100;
    r.abrir("x");
    assert.equal(r.fundido(p), 0);
    ahora = 100 + DESVANECIDO / 2;
    assert.equal(r.fundido(p), 0.5);
    ahora = 100 + DESVANECIDO * 3;
    assert.equal(r.fundido(p), 1, "se queda en 1, no sigue subiendo");
  });

  await t.test("y la F está en la tabla de teclas del juego", () => {
    // Es lo que no estaba: los paneles de antes escuchaban `keydown` por su
    // cuenta, así que no había ninguna tecla que se pudiera reasignar.
    const a = ACCIONES.find((x) => x.clave === "interactuar");
    assert.ok(a, "no existe la acción `interactuar`");
    assert.equal(a.nombre, "Interact with NPC", "el nombre sale de kb_act.lst:41");
    assert.equal(a.cfg, "f", "y la tecla de config.cfg:19");
    assert.equal(a.boton, false, "no es un `pev->button`: es interfaz");
    assert.equal(porDefecto().interactuar, "KeyF");
  });
});

// ── 4. LAS OPCIONES, QUE SON DEL SERVIDOR ───────────────────────────────────

test("las opciones de un NPC salen de su script", async (t) => {
  const PERSONAJE = {
    oro: 500,
    inventario: [{ clave: "item_letter_almund" }, "item_gaxe_handle"],
    manos: { derecha: { clave: "weapon_shortsword", nombre: "Rusty Short Sword" }, izquierda: null },
  };

  await t.test("el lector del bloque, y los paréntesis que no hay que partir", () => {
    // El fallo de la primera versión: quitar el paréntesis de delante y el de
    // detrás a ciegas parte `$item_exists(PARAM1,item_x)` por la mitad, la
    // condición se queda sin cerrar y `juzgar()` la da por indescifrable. Y en
    // la salida se leía bien, que es lo peor.
    assert.equal(envoltorio("( OFFER_SET )"), "OFFER_SET");
    assert.equal(envoltorio("$item_exists(PARAM1,item_x)"), "$item_exists(PARAM1,item_x)");
    assert.equal(envoltorio("( $item_exists(PARAM1,item_x) )"), "$item_exists(PARAM1,item_x)");
  });

  await t.test("un bloque de verdad, con sus dos condiciones anidadas", () => {
    const ops = leerOpciones(bloqueDe(`
{ game_menu_getoptions

  if ( QUEST_X == 0 )
  {
  	if( $item_exists(PARAM1,item_letter_almund) )
	{
		local reg.mitem.title 	"Give Almund's Letter"
		local reg.mitem.type 	payment
		local reg.mitem.data 	item_letter_almund
		local reg.mitem.callback say_ending
		menuitem.register
	}
  }
}
`, "game_menu_getoptions"));
    assert.equal(ops.length, 1);
    assert.equal(ops[0].titulo, "Give Almund's Letter");
    assert.equal(ops[0].tipo, "payment");
    assert.deepEqual(ops[0].condiciones, ["QUEST_X == 0", "$item_exists(PARAM1,item_letter_almund)"]);
  });

  await t.test("EL FALLO DEL SCRIPT: un `if` sin llaves guarda sólo la línea siguiente", () => {
    // `menuitem.register` no limpia `reg.mitem.*` (npcscript.cpp:940-1000), así
    // que sin el objeto la opción se registra igual con el título ANTERIOR.
    const ops = leerOpciones(bloqueDe(`
{ game_menu_getoptions
	local reg.mitem.title 	"Ask about broken axe"
	local reg.mitem.type 	callback
	menuitem.register

	if $item_exists(PARAM1,item_ore_lorel)
	local reg.mitem.title 	"Show Loreldian Ore"
	local reg.mitem.type 	callback
	local reg.mitem.data 	say_ore
	menuitem.register
}
`, "game_menu_getoptions"));
    assert.equal(ops.length, 2);
    assert.deepEqual(ops[1].condiciones, [], "el registro NO está guardado por el if");
    assert.equal(ops[1].guardaSoloElTitulo, "$item_exists(PARAM1,item_ore_lorel)");
  });

  await t.test("`stradd` concatena, que es como se compone «Pay N gold»", () => {
    const ops = leerOpciones(bloqueDe(`
{ game_menu_getoptions
	local reg.mitem.title 	"Pay "
	stradd reg.mitem.title	500
	stradd reg.mitem.title	" gold"
	menuitem.register
}
`, "game_menu_getoptions"));
    assert.equal(ops[0].titulo, "Pay 500 gold");
  });

  await t.test("los ocho tipos, y que lo desconocido cae en `callback`", () => {
    assert.equal(tipoDe("payment_silent"), "payment");
    assert.equal(tipoDe("green"), "green");
    assert.equal(tipoDe("DISABLED"), "disabled");
    assert.equal(tipoDe("lo que sea"), "callback", "npcscript.cpp:972-973");
  });

  await t.test("qué condiciones se pueden decidir", () => {
    assert.equal(juzgar("!OFFER_SET").vale, true, "sin misiones, la variable está sin poner");
    assert.equal(juzgar("OFFER_SET").vale, false);
    assert.equal(juzgar("QUEST_X == 0").vale, true);
    assert.deepEqual(juzgar("$item_exists(PARAM1,item_x)").necesita, { objeto: "item_x" });
    assert.equal(juzgar("ZOMBIE_COUNT < REQ_ZOMBIES").decidible, false);
    assert.equal(juzgar("USED_ME equals X").decidible, false);
  });

  await t.test("el inventario decide, y las manos cuentan", () => {
    assert.equal(llevaObjeto(PERSONAJE, "item_letter_almund"), true);
    assert.equal(llevaObjeto(PERSONAJE, "item_gaxe_handle"), true, "una cadena suelta también vale");
    assert.equal(llevaObjeto(PERSONAJE, "weapon_shortsword"), true, "lo que llevas en la mano cuenta");
    assert.equal(llevaObjeto(PERSONAJE, "item_no_existe"), false);
    assert.equal(llevaObjeto(null, "item_x"), false, "sin personaje no se rompe");
  });

  await t.test("el coste de un pago: `gold:10000;item_x;item_y:2`", () => {
    assert.deepEqual(costeDe("gold:10000;item_gaxe_handle;item_ore_lorel"),
      { oro: 10000, objetos: ["item_gaxe_handle", "item_ore_lorel"] });
    assert.deepEqual(costeDe("item_x:2"), { oro: 0, objetos: ["item_x"] });
    assert.deepEqual(costeDe(""), { oro: 0, objetos: [] });
    const p = puedePagar(PERSONAJE, "gold:10000;item_gaxe_handle");
    assert.equal(p.puede, false);
    assert.deepEqual(p.falta, ["10000 gold"], "el objeto sí lo lleva; el oro no");
    assert.equal(puedePagar(PERSONAJE, "gold:100").puede, true);
  });

  await t.test("la opción cuya condición no se cumple NO APARECE, como en el juego", () => {
    const ficha = { opciones: { "x/y": [
      { titulo: "Nunca", tipo: "callback", datos: "", juicio: [{ decidible: true, vale: false }] },
      { titulo: "Siempre", tipo: "callback", datos: "", juicio: [] },
    ] } };
    const ops = opcionesDe(ficha, "x/y", PERSONAJE);
    assert.deepEqual(ops.map((o) => o.titulo), ["Siempre"]);
  });

  await t.test("y la que no se sabe decidir aparece APAGADA, con su motivo", () => {
    // Ésta es la única diferencia con el original y es a propósito: allí la
    // opción no se registra y no existe. Aquí se ve gris y dice por qué, que es
    // la misma decisión del menú principal con «Visit a Kingdom».
    const ficha = { opciones: { "x/y": [
      { titulo: "Zombies", tipo: "callback", datos: "",
        juicio: [{ decidible: false, porque: "ZOMBIE_COUNT < REQ_ZOMBIES" }] },
    ] } };
    const [op] = opcionesDe(ficha, "x/y", PERSONAJE);
    assert.equal(op.tipo, "disabled", "`MOT_DISABLED`, que es un tipo del propio motor");
    assert.match(op.porque, /ZOMBIE_COUNT/);
  });

  await t.test("un objeto que no llevas quita la opción; llevarlo la pone", () => {
    const ficha = { opciones: { "x/y": [
      { titulo: "Give letter", tipo: "payment", datos: "item_letter_almund",
        juicio: [{ decidible: true, necesita: { objeto: "item_letter_almund" } }] },
    ] } };
    assert.equal(opcionesDe(ficha, "x/y", PERSONAJE).length, 1);
    assert.equal(opcionesDe(ficha, "x/y", { inventario: [] }).length, 0);
  });

  await t.test("sin ficha no hay opciones y no se rompe", () => {
    assert.deepEqual(opcionesDe(null, "x/y", PERSONAJE), []);
    assert.deepEqual(opcionesDe({ opciones: {} }, "no/existe", PERSONAJE), []);
  });

  await t.test("el menú del propio jugador: describir lo que llevas en la mano", () => {
    // `else pMonster = pPlayer;` (client.cpp:679-682) y `MOT_DESC` ->
    // `ShowWeaponDesc(player.ActiveItem())`. Con la mano vacía no hay nada que
    // describir y el menú se queda con el Cancel, que es lo que hace el juego.
    assert.deepEqual(opcionesDelJugador(PERSONAJE).map((o) => o.tipo), ["itemdesc"]);
    assert.match(opcionesDelJugador(PERSONAJE)[0].titulo, /Rusty Short Sword/);
    assert.deepEqual(opcionesDelJugador({ manos: {} }), []);
    assert.deepEqual(opcionesDelJugador(null), []);
  });

  if (existsSync("build/gatecity/menus.json")) {
    await t.test("y contra los scripts de verdad de Gate City", () => {
      const f = JSON.parse(readFileSync("build/gatecity/menus.json", "utf8"));
      const npcs = Object.keys(f.opciones);
      assert.ok(npcs.length >= 4, `sólo ${npcs.length} NPC con menú`);
      // La de `storage` no tiene condiciones: es la única que sale siempre, y es
      // la que hace que el panel se pueda probar andando hasta ella.
      const hail = f.opciones["gatecity/storage"]?.find((o) => o.titulo === "Hail");
      assert.ok(hail, "el almacenista tiene que tener su «Hail»");
      assert.deepEqual(hail.condiciones, []);
      assert.equal(opcionesDe(f, "gatecity/storage", PERSONAJE).length, 1);
    });
  }
});
