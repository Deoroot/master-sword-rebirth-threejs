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
import { opcionesDe, llevaObjeto, costeDe, puedePagar, opcionesDelJugador,
  opcionesDeOtroJugador, TIPOS } from "../src/play/opciones.js";
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

  if (existsSync("build/msr/vgui.json")) {
    await t.test("y contra el fichero de verdad: los tamaños NO van en orden", () => {
      // El hallazgo de los datos del propio juego: el archivo de 1440 pone 21
      // donde el de 1920 pone 16, o sea que a 1440 el texto del cuerpo se ve MÁS
      // GRANDE que a 1920. No es un error de lectura y no se arregla.
      const f = JSON.parse(readFileSync("build/msr/vgui.json", "utf8"));
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

// ── 3b. EL PUNTERO, que es lo que hacía los paneles inservibles ─────────────
//
// El fallo: `atrapaElRaton` estaba escrito desde el 29 y nadie lo conectaba, así
// que el inventario y el menú de la F se abrían con el puntero atrapado en el
// `canvas` y **no se podía pulsar ni un botón**. El motor no deja esa decisión al
// panel: la toma el viewport en `UpdateCursorState`, al abrir y al cerrar
// (vgui_teamfortressviewport.cpp:1489-1493, vgui_global.cpp:67-72).

test("el registro avisa de quién manda el puntero", async (t) => {
  const esquema = new Esquema(null, 640);
  const hacer = () => {
    const avisos = [];
    const r = new Registro({ esquema, cursor: (atrapa) => avisos.push(atrapa) });
    return { r, avisos };
  };

  await t.test("abrir un panel normal pide soltar el puntero, y cerrarlo devolverlo", () => {
    const { r, avisos } = hacer();
    r.poner(new Espia("inventory", ATRAPA_NUMEROS | CERRAR_CON_ESC));
    r.abrir("inventory");
    assert.deepEqual(avisos, [true], "al abrir: el ratón es del panel");
    r.cerrar();
    assert.deepEqual(avisos, [true, false], "al cerrar: el ratón vuelve al juego");
  });

  await t.test("pero la hoja NO lo suelta, porque es `m_NoMouse`", () => {
    // El control opuesto, y no es un detalle: `CStatPanel` se lee sin perder la
    // cámara (`m_NoMouse = true`, vgui_stats.cpp:75 → vgui_global.cpp:103-108).
    // Portarlo al revés daría una hoja de personaje que te suelta el ratón.
    const { r, avisos } = hacer();
    r.poner(new Espia("stats", CERRAR_CON_ESC, true));
    r.abrir("stats");
    assert.deepEqual(avisos, [false], "abierta y con el puntero todavía atrapado");
    assert.equal(r.atrapaElRaton, false);
  });

  await t.test("y cambiar de panel avisa de los dos, en orden", () => {
    // No se apilan: abrir el inventario con la hoja delante cierra la hoja
    // (`CanOpen`, vgui_global.cpp:92-96). O sea que el aviso tiene que pasar por
    // el `false` del cierre antes del `true` del nuevo, y no saltárselo.
    const { r, avisos } = hacer();
    r.poner(new Espia("stats", CERRAR_CON_ESC, true));
    r.poner(new Espia("inventory", CERRAR_CON_ESC));
    r.abrir("stats");
    r.abrir("inventory");
    assert.deepEqual(avisos, [false, false, true]);
  });

  await t.test("sin `cursor` no se cae: el registro corre igual en Node", () => {
    // Las pruebas y el servidor montan registros sin DOM. Si `cursorCambio`
    // exigiera el callback, esto sería un `TypeError` en cada prueba de arriba.
    const r = new Registro({ esquema });
    r.poner(new Espia("x", 0));
    assert.doesNotThrow(() => { r.abrir("x"); r.cerrar(); });
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

  await t.test("un `if` VIEJO gobierna todo lo que viene detrás, no una línea", () => {
    // Esta prueba fijaba un hallazgo FALSO: decía que sin el mineral salía
    // «Ask about broken axe» dos veces, porque `menuitem.register` no limpia
    // `reg.mitem.*` (npcscript.cpp:940-1000) — cierto— y el `if` guardaba sólo
    // el título —también cierto—. Lo que faltaba es que hay DOS condicionales:
    // `if ( X )` se salta sus hijos y sigue, `if X` **abandona el evento**
    // (`break; //Old if command`, script.cpp:5754-5758; la distinción se hace
    // en :5310-5317 por el paréntesis). Sin el mineral no se registra nada
    // más, así que no hay duplicado: hay una opción que desaparece.
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
    // La primera va ANTES del `if` viejo, así que no la toca.
    assert.deepEqual(ops[0].condiciones, [], "la de antes del if no está guardada");
    assert.equal(ops[0].cortes, 0);
    // Y la segunda sí: si el `if` falla, el evento se abandona y ésta no llega
    // a registrarse. O sea que la condición SÍ la gobierna, al revés de lo que
    // decía esta prueba.
    assert.deepEqual(ops[1].condiciones, ["$item_exists(PARAM1,item_ore_lorel)"]);
    assert.equal(ops[1].cortes, 1);
  });

  await t.test("y el `if` NUEVO, con paréntesis, no se lleva a las de detrás", () => {
    // El control que sujeta al de arriba: si los dos `if` se trataran igual,
    // los dos saldrían con `cortes` y el de arriba estaría verde por casualidad.
    const ops = leerOpciones(bloqueDe(`
{ game_menu_getoptions
	if ( $item_exists(PARAM1,item_x) )
	{
		local reg.mitem.title 	"Con el objeto"
		local reg.mitem.type 	callback
		menuitem.register
	}
	local reg.mitem.title 	"Siempre"
	local reg.mitem.type 	callback
	menuitem.register
}
`, "game_menu_getoptions"));
    assert.equal(ops.length, 2);
    assert.deepEqual(ops[0].condiciones, ["$item_exists(PARAM1,item_x)"]);
    assert.equal(ops[0].cortes, 0, "el nuevo no es un corte");
    assert.deepEqual(ops[1].condiciones, [], "y la de detrás se registra igual");
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

  await t.test("el menú del propio jugador son las SEIS de player_sv_menu.script", () => {
    // Antes aquí había una sola entrada, «Describe <lo de la mano>», deducida
    // del C++. El menú del jugador no lo decide el C++: lo decide un script,
    // igual que el de cualquier NPC (player_sv_menu.script:11-15). Los títulos
    // se comprueban LITERALES porque son los que se ven en la pantalla del
    // juego, y una errata aquí es una errata en la interfaz.
    assert.deepEqual(opcionesDelJugador(PERSONAJE).map((o) => o.titulo), [
      "Sit Down (Rest)",
      "Emote: Nod Yes",
      "Emote: Nod No",
      "Emote: Stand At Attention",
      "Item Desc",
      "Forgive Last PK",
    ]);
    assert.deepEqual(opcionesDelJugador(PERSONAJE).map((o) => o.tipo),
      ["callback", "callback", "callback", "callback", "itemdesc", "forgive"]);
    // Los ocho tipos del motor mandan: ninguno puede ser inventado.
    for (const o of opcionesDelJugador(PERSONAJE)) assert.ok(TIPOS.includes(o.tipo), o.tipo);
  });

  await t.test("y sentado el menú ENCOGE, que es la única condición que tiene", () => {
    // `if ( !$get(ent_me,sitting) )` gobierna la primera y envuelve las tres
    // emociones: de pie seis, sentado tres. Sin este control lo de arriba
    // pasaría igual con la condición sin portar.
    const sentado = opcionesDelJugador(PERSONAJE, { sentado: true });
    assert.deepEqual(sentado.map((o) => o.titulo), ["Stand Up", "Item Desc", "Forgive Last PK"]);
    assert.equal(opcionesDelJugador(PERSONAJE, { sentado: false }).length, 6);
  });

  await t.test("el menú de OTRO jugador está vacío, y es del original", () => {
    // `menu_other` existe y no registra nada: Give/Trade/Party/Duel están
    // comentadas enteras en player_sv_menu.script:74-91 y :160-186.
    assert.deepEqual(opcionesDeOtroJugador(), []);
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

// ── 5. CREAR PERSONAJE: las medidas, que es donde están los fallos ──────────

test("crear personaje: las tres etapas y los dos fallos de medida", async (t) => {
  const { espaciador, inicioDeArmas, inicioDeArmasSano, MEDIDAS: M, COLORES: C, ETAPA, RANURAS, MAX_ARMAS, MAX_LETRAS, ARMA_PX } =
    await import("../src/vgui/personaje.js");

  await t.test("son tres etapas, en su orden", () => {
    // `enum stage_e { STG_CHOOSECHAR, STG_CHOOSEGENDER, STG_CHOOSEWEAPON }`
    assert.deepEqual([ETAPA.ELEGIR, ETAPA.QUIEN, ETAPA.ARMA], [0, 1, 2]);
    assert.equal(RANURAS, 3, "CHOOSEPANEL_MAINBTNS");
    assert.equal(MAX_ARMAS, 9, "«Max of 9 starting weapon choices»");
    assert.equal(MAX_LETRAS, 32, "m_MaxLetters");
  });

  await t.test("EL FALLO 1: `XRES(16) * XRES(1)` convierte dos veces", () => {
    // A 640 no se nota, que es por lo que sigue ahí: 16 × 1 = 16.
    assert.equal(espaciador(640), 16);
    // A 1920, `XRES(1)` vale 3, así que el hueco entre personajes es el TRIPLE
    // del que se quería: 48 unidades de referencia en vez de 16.
    assert.equal(espaciador(1920), 48);
    assert.equal(espaciador(1280), 32);
    // Y crece con la resolución sin parar, que es lo que lo hace un fallo y no
    // una medida rara: a 3840 son 96 donde tocaban 16.
    assert.equal(espaciador(3840), 96);
  });

  await t.test("EL FALLO 2: la rejilla de armas se va a la izquierda", () => {
    // `GetCenteredItemX` con el `−1` fuera del paréntesis, Y con el espaciador
    // roto de arriba. A 640 la diferencia son siete píxeles y nadie la ha visto.
    assert.equal(inicioDeArmasSano(640, 640) - inicioDeArmas(640, 640), 7);
    // A 1920 son CIENTO SESENTA Y SIETE, y eso sí se ve: la rejilla de armas
    // se va casi media columna a la izquierda.
    assert.equal(inicioDeArmasSano(1920, 1920) - inicioDeArmas(1920, 1920), 167);
    // LOS DOS FALLOS SE MULTIPLICAN, y la cuenta sale exacta: el error es
    // `espaciador/2 - 1`, y el espaciador ya venía inflado por el fallo 1. O
    // sea que el error crece con la resolución cuando tendría que ser fijo.
    for (const ancho of [640, 960, 1280, 1920, 3840]) {
      const sano = Math.floor(16 * (ancho / 640) + 0.5);
      const roto = sano * Math.floor(1 * (ancho / 640) + 0.5);
      // `1,5 × roto − sano − 1`: uno y medio del espaciador inflado, menos el
      // que tocaba, menos el `−1` de la precedencia. Los dos fallos en la misma
      // resta, que es por lo que el desvío crece y no se queda en siete píxeles.
      assert.equal(
        inicioDeArmasSano(ancho, ancho) - inicioDeArmas(ancho, ancho),
        1.5 * roto - sano - 1,
        `a ${ancho} px: espaciador ${sano} inflado a ${roto}`
      );
    }
  });

  await t.test("el botón de arma NO escala: 128 píxeles a cualquier resolución", () => {
    // `#define WEAPON_BTN_SIZEX 128`, sin `XRES`. Es de las pocas medidas del
    // panel que no pasan por ahí, y es una decisión: son imágenes de 128×128 y
    // estirarlas las emborrona.
    assert.equal(ARMA_PX, 128);
  });

  await t.test("y los colores son los del original, con su errata incluida", () => {
    assert.deepEqual(C.disponible, [0, 255, 0, 0], "EnabledColor: el verde de un personaje");
    assert.deepEqual(C.apagado, [128, 128, 128, 80]);
    assert.deepEqual(C.nuevo, [255, 255, 255, 0]);
    assert.deepEqual(C.info, [192, 192, 192, 128]);
    assert.deepEqual(C.resaltado, [255, 0, 0, 0], "HightlightColor, así escrito");
    assert.equal(M.ranuraAncho, 110);
    assert.equal(M.ranuraAlto, 130);
    assert.equal(M.campoAlto, 20, "el campo de nombre tampoco escala");
  });
});

// ── CHARACTER INFO: la fila del panel de la derecha ────────────────────────
//
// `vgui_stats.cpp` pinta las habilidades en DOS sitios con DOS formatos, y el
// porcentaje vive sólo en el de la derecha (`:344`); la lista de la izquierda es
// «nombre: número» y nada más (`:277`). Eso no lo puede comprobar una prueba de
// Node —es pantalla— y va en `sondas/vgui29.mjs`. Lo que sí se comprueba aquí es
// la cadena, que es aritmética y formato.
test("la fila de propiedad del panel de habilidad", async (t) => {
  const { filaDePropiedad } = await import("../src/vgui/estadisticas.js");
  const { expNecesaria } = await import("../src/juego/stats.js");

  await t.test("trae el nombre con mayúscula, el porcentaje y lo que falta", () => {
    // Elegido para que el porcentaje no sea redondo: la mitad justa de lo que
    // pide pasar de 2 a 3.
    const falta = expNecesaria(2);
    const f = filaDePropiedad({ clave: "proficiency", valor: 2, exp: falta / 2 }, 3);
    assert.equal(f, `Proficiency: 2 (50.00%) [${Math.ceil(falta / 2)} left]`);
  });

  await t.test("el nombre sale de `SkillTypeList` y no de la clave interna", () => {
    // El fallo que tenía: `${p.clave}` daba «proficiency» en minúscula.
    assert.match(filaDePropiedad({ clave: "power", valor: 1, exp: 0 }, 3), /^Power: /);
    assert.match(filaDePropiedad({ clave: "balance", valor: 1, exp: 0 }, 3), /^Balance: /);
  });

  await t.test("con más de tres propiedades los nombres son las escuelas", () => {
    // `if (iSubStats <= STATPROP_TOTAL) Name = SkillTypeList[i]; else SpellTypeList[i];`
    // — vgui_stats.cpp:331-335. Un mago tiene cinco.
    assert.match(filaDePropiedad({ clave: "fire", valor: 1, exp: 0 }, 5), /^Fire: /);
    assert.match(filaDePropiedad({ clave: "affliction", valor: 1, exp: 0 }, 5), /^Affliction: /);
  });

  await t.test("dos decimales siempre, que es el `%.2f` del motor", () => {
    const falta = expNecesaria(3);
    assert.match(filaDePropiedad({ clave: "power", valor: 3, exp: falta }, 3), /\(100\.00%\)/);
    assert.match(filaDePropiedad({ clave: "power", valor: 3, exp: 0 }, 3), /\(0\.00%\)/);
  });

  await t.test("los tres topes del motor", () => {
    const falta = expNecesaria(4);
    // `if (Percent > 100.0) Percent = 100.0;`
    assert.match(filaDePropiedad({ clave: "power", valor: 4, exp: falta * 9 }, 3), /\(100\.00%\)/);
    // `if (Percent < 0.0) Percent = 0.0;`
    assert.match(filaDePropiedad({ clave: "power", valor: 4, exp: -50 }, 3), /\(0\.00%\)/);
  });

  await t.test("una propiedad a cero no da «NaN%», y ésa es la guarda que importa", () => {
    // `expNecesaria(0)` vale 0 —«el primer punto es gratis»—, así que esto es una
    // división por cero. En C da `inf` y lo recogen los topes; en JavaScript da
    // `NaN`, y `NaN` no es mayor que 100 ni menor que 0, así que ningún tope lo
    // atrapa: lo atrapa `if (SubStat.Value == 0) Percent = 0.0`, que por eso NO
    // es cosmética. Un personaje recién creado tiene dos propiedades a cero en
    // cada arma, o sea que esto se ve en la primera partida de cualquiera.
    const f = filaDePropiedad({ clave: "proficiency", valor: 0, exp: 0 }, 3);
    assert.equal(f, "Proficiency: 0 (0.00%) [0 left]");
    assert.doesNotMatch(f, /NaN/);
  });

  await t.test("el valor se trunca, no se redondea: `(int)SubStat.Value`", () => {
    assert.match(filaDePropiedad({ clave: "power", valor: 2.9, exp: 0 }, 3), /^Power: 2 /);
  });

  await t.test("lo que falta se redondea hacia ARRIBA: `(int)ceil(ExpToLevel)`", () => {
    // Con un punto de experiencia de menos que el necesario, «0 left» sería
    // mentira: todavía falta. `ceil` es lo que lo impide.
    const falta = expNecesaria(5);
    const f = filaDePropiedad({ clave: "power", valor: 5, exp: falta - 0.4 }, 3);
    assert.match(f, /\[1 left\]/);
  });

  await t.test("usa `GetExpNeeded(valor)` y NO `valor + 1`", () => {
    // La trampa que `src/juego/stats.js:300` ya tiene documentada para la subida,
    // y que `src/juego/interfaz.js` hace al revés a propósito porque responde a
    // otra pregunta. Si esto usara `valor + 1` el porcentaje saldría ~1,248 veces
    // más pequeño y seguiría pareciendo razonable: por eso se fija aquí.
    const f = filaDePropiedad({ clave: "power", valor: 10, exp: expNecesaria(10) }, 3);
    assert.match(f, /\(100\.00%\)/, "con la exp justa del valor ACTUAL es el 100 %");
    assert.notEqual(expNecesaria(10), expNecesaria(11), "control: las dos curvas difieren");
  });
});
