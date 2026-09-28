// LAS RANURAS RÁPIDAS Y EL MENÚ. Lo que el motor deja escrito, comprobado.
//
// Todo lo de aquí sale de `vgui_quickslot.h`, de `GetItemInInventory`
// (msmonstershared.cpp:230) y de los cuatro archivos de texto del menú. Cuando
// una prueba comprueba algo que parece un fallo, lo dice: se porta con el fallo
// y la prueba lo documenta.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import {
  Ciclador, Ranuras, TIPO, MAX_RANURAS, TECLAS_DE_RANURA, ESPERA,
  AGUANTE_PARA_GRABAR, COLORES, SONIDOS, siguienteEnInventario, tipoDeProyectil, INFINITAS,
} from "../src/play/ranuras.js";
import { entradasVisibles, quehace, siguienteElegible, COMANDOS } from "../src/play/menu.js";
import { ACCIONES, RANURAS, ALIAS, porDefecto, Teclas } from "../src/juego/teclas.js";

/** Tres armas y una piedra, que es lo que hace falta para casi todo. */
const MOCHILA = [
  { id: "swords_rsword", nombre: "Rusty Sword", arma: true },
  { id: "axes_handaxe", nombre: "Hand Axe", arma: true },
  { id: "misc_rock", nombre: "Rock", arma: false },
  { id: "bows_shortbow", nombre: "Short Bow", arma: true },
];

describe("las teclas son configuración, no código", () => {
  test("el 1 cicla armas y el 2 hechizos, que es lo que dice kb_def.lst", () => {
    const m = porDefecto();
    assert.equal(m.ciclarArma, "Digit1");
    assert.equal(m.ciclarHechizo, "Digit2");
  });

  test("pero la MUNICIÓN es la 4, no la 3: la 3 abre el inventario", () => {
    const m = porDefecto();
    assert.equal(m.ciclarMunicion, "Digit4");
    // Nosotros le dejamos la I al inventario, que es el otro bind que el juego
    // trae para lo mismo. Lo que importa es que la 4 no sea el inventario.
    assert.notEqual(m.ciclarMunicion, m.inventario);
  });

  test("hay doce ranuras con tecla y son F1..F12", () => {
    assert.equal(RANURAS.length, TECLAS_DE_RANURA);
    const m = porDefecto();
    assert.equal(m.ranura1, "F1");
    assert.equal(m.ranura12, "F12");
  });

  test("y las cinco primeras tienen el SEGUNDO bind del juego: 6, 7, 8, 9 y 0", () => {
    assert.deepEqual(ALIAS, {
      Digit6: "ranura1", Digit7: "ranura2", Digit8: "ranura3",
      Digit9: "ranura4", Digit0: "ranura5",
    });
  });

  test("el alias vale, pero el mapa manda: quien se ponga el 6 para saltar, salta", () => {
    const t = new Teclas({ almacen: null });
    t.abajo("Digit6");
    assert.equal(t.pulsada("ranura1"), true, "el 6 es la ranura 1 de fábrica");
    t.asignar("saltar", "Digit6");
    assert.equal(t.pulsada("ranura1"), false, "ya no, se la ha quedado saltar");
    assert.equal(t.pulsada("saltar"), true);
  });

  test("ninguna de las nuevas cuenta como pev->button", () => {
    // Meterlas ahí resucitaría a un muerto que pulsa F1, que es el fallo que
    // ya costó tres controles con la Escape.
    const nuevas = ["ciclarArma", "ciclarHechizo", "ciclarMunicion", "ranura1", "menu"];
    for (const c of nuevas) {
      assert.equal(ACCIONES.find((a) => a.clave === c).boton, false, c);
    }
  });
});

describe("de dónde sale el siguiente objeto", () => {
  test("da la vuelta al llegar al final, y por accidente", () => {
    // No hay `% tamaño` en el motor: el bucle no encuentra el siguiente y cae
    // en `if (Items.size()) return Items[0];`.
    const ultimo = "bows_shortbow";
    assert.equal(siguienteEnInventario(MOCHILA, ultimo, { soloArmas: true }).id, "swords_rsword");
  });

  test("lo que llevas en la mano NO está en la lista", () => {
    const conMano = MOCHILA.map((o) => (o.id === "axes_handaxe" ? { ...o, enMano: true } : o));
    const ids = [];
    let desde = null;
    for (let i = 0; i < 5; i++) {
      const s = siguienteEnInventario(conMano, desde, { soloArmas: true });
      ids.push(s.id); desde = s.id;
    }
    assert.ok(!ids.includes("axes_handaxe"), `no debería ofrecer la de la mano: ${ids}`);
  });

  test("«arma» es «tiene ataques», no una categoría", () => {
    const ids = [];
    let desde = null;
    for (let i = 0; i < 3; i++) {
      const s = siguienteEnInventario(MOCHILA, desde, { soloArmas: true });
      ids.push(s.id); desde = s.id;
    }
    assert.deepEqual(ids, ["swords_rsword", "axes_handaxe", "bows_shortbow"]);
    assert.ok(!ids.includes("misc_rock"));
  });

  test("con la mochila vacía no hay siguiente", () => {
    assert.equal(siguienteEnInventario([], null, { soloArmas: true }), null);
  });
});

describe("el ciclador de armas", () => {
  const mundo = { objetos: MOCHILA, hechizos: [], flechas: [] };

  test("la primera pulsación enseña la primera arma y suena", () => {
    const c = new Ciclador();
    assert.equal(c.elegir("weapon", mundo), SONIDOS.elegir);
    assert.equal(c.etiqueta.texto, "Rusty Sword");
    assert.deepEqual(c.etiqueta.rgb, COLORES.objeto);
  });

  test("y al dar la vuelta entera se APAGA sola: ése es el único aviso", () => {
    const c = new Ciclador();
    c.elegir("weapon", mundo);   // Rusty Sword — y ésta queda de «primera»
    c.elegir("weapon", mundo);   // Hand Axe
    c.elegir("weapon", mundo);   // Short Bow
    assert.equal(c.activo, true);
    assert.equal(c.elegir("weapon", mundo), null, "la vuelta no suena");
    assert.equal(c.etiqueta, null);
  });

  test("LA ESPERA NO ELIGE: TIRA lo que haya puesto", () => {
    // `ConfirmItem()` está COMENTADO en `Update()` y lo que corre es
    // `SelectItem(NULL)` (vgui_quickslot.h:81-85). Quien cicla y se queda
    // mirando se queda con el arma que tenía.
    const c = new Ciclador();
    c.elegir("weapon", mundo);
    c.paso(ESPERA - 0.1);
    assert.equal(c.activo, true, "todavía no");
    c.paso(0.2);
    assert.equal(c.activo, false);
    assert.equal(c.confirmar(), null, "y no hay nada que aceptar");
  });

  test("cada pulsación reinicia la espera", () => {
    const c = new Ciclador();
    c.elegir("weapon", mundo);
    c.paso(2.0);
    c.elegir("weapon", mundo);
    c.paso(2.0);
    assert.equal(c.activo, true, "cuatro segundos, pero ninguno seguido");
  });

  test("el botón de atacar acepta, y lo que sale es el comando del motor", () => {
    const c = new Ciclador();
    c.elegir("weapon", mundo);
    const o = c.confirmar();
    assert.equal(o.que, "empunar");
    assert.equal(o.id, "swords_rsword");
    assert.equal(o.comando, "inv transfer swords_rsword 0");
    assert.equal(c.activo, false, "aceptar apaga la etiqueta");
  });

  test("cambiar de tipo con la etiqueta puesta la TIRA, no la deja a medias", () => {
    const c = new Ciclador();
    c.elegir("weapon", mundo);
    assert.equal(c.activo, true);
    c.elegir("spell", { ...mundo, hechizos: [] });
    assert.equal(c.activo, false, "sin hechizos que ofrecer, se queda en nada");
    assert.equal(c.confirmar(), null, "y el arma que estaba a medias no se equipa");
  });

  test("sin armas en la mochila no pasa NADA, y es el bug del motor", () => {
    // `if (pItem) {...}` sin `else` (vgui_quickslot.h:114). La rama de la
    // munición sí apaga en ese caso (226); la de las armas no.
    const c = new Ciclador();
    assert.equal(c.elegir("weapon", { objetos: [] }), null);
    assert.equal(c.activo, false);
  });
});

describe("el ciclador de hechizos, que NO da la vuelta", () => {
  const mundo = { objetos: [], flechas: [], hechizos: ["Heal", "Firebolt"] };

  test("empieza por el primero y lleva «Cast » delante", () => {
    const c = new Ciclador();
    c.elegir("spell", mundo);
    assert.equal(c.etiqueta.texto, "Cast Heal");
    assert.deepEqual(c.etiqueta.rgb, COLORES.hechizo);
  });

  test("al llegar al último se apaga: las armas vuelven al primero y éstos no", () => {
    const c = new Ciclador();
    c.elegir("spell", mundo);   // Heal
    c.elegir("spell", mundo);   // Firebolt
    assert.equal(c.etiqueta.texto, "Cast Firebolt");
    c.elegir("spell", mundo);   // y se acabó
    assert.equal(c.activo, false);
  });

  test("sin hechizos aprendidos no enseña nada, que es lo que le pasa hoy al jugador", () => {
    const c = new Ciclador();
    assert.equal(c.elegir("spell", { hechizos: [] }), null);
    assert.equal(c.etiqueta, null);
  });

  test("y lo que acepta es `prep <nombre>`", () => {
    const c = new Ciclador();
    c.elegir("spell", mundo);
    assert.equal(c.confirmar().comando, "prep Heal");
  });
});

describe("el ciclador de munición", () => {
  const ARCO = { ataques: [{ proyectil: "proj_arrow_wooden" }] };
  const BALLESTA = { ataques: [{ proyectil: "proj_bolt_iron" }] };
  const ESPADA = { ataques: [{ proyectil: "" }] };
  const FLECHAS = [
    { id: "proj_arrow_fire", nombre: "Fire Arrow" },
    { id: "proj_bolt_iron", nombre: "Iron Bolt" },
  ];

  test("el arma de la mano decide si pide flechas o virotes", () => {
    assert.equal(tipoDeProyectil(ARCO), "flecha");
    assert.equal(tipoDeProyectil(BALLESTA), "virote");
    assert.equal(tipoDeProyectil(ESPADA), "cualquiera");
    assert.equal(tipoDeProyectil(null), "cualquiera");
  });

  test("la PRIMERA siempre es la de balde, y lo dice", () => {
    const c = new Ciclador();
    c.elegir("arrow", { armaEnMano: ARCO, flechas: FLECHAS });
    assert.equal(c.etiqueta.texto, "Crude Wooden Arrow (Infinite)");
    assert.deepEqual(c.etiqueta.rgb, COLORES.flecha);
  });

  test("con una ballesta la de balde es el virote", () => {
    const c = new Ciclador();
    c.elegir("arrow", { armaEnMano: BALLESTA, flechas: FLECHAS });
    assert.equal(c.etiqueta.texto, "Crude Wooden Bolt (Infinite)");
  });

  test("con un arma que no dispara salen LAS DOS de balde, una detrás de otra", () => {
    const c = new Ciclador();
    c.elegir("arrow", { armaEnMano: ESPADA, flechas: [] });
    assert.equal(c.etiqueta.texto, "Crude Wooden Arrow (Infinite)");
    c.elegir("arrow", { armaEnMano: ESPADA, flechas: [] });
    assert.equal(c.etiqueta.texto, "Crude Wooden Bolt (Infinite)");
  });

  test("después vienen las de la mochila, y sólo las del tipo que pide el arma", () => {
    const c = new Ciclador();
    const mundo = { armaEnMano: ARCO, flechas: FLECHAS };
    c.elegir("arrow", mundo);   // la de balde
    c.elegir("arrow", mundo);   // la primera de verdad
    assert.equal(c.etiqueta.texto, "Fire Arrow");
    assert.ok(!c.etiqueta.texto.includes("Infinite"));
    // El virote no sale con un arco: el prefijo es `proj_arrow_`.
    c.elegir("arrow", mundo);
    assert.equal(c.activo, false, "sólo había una flecha y ya se ha dado la vuelta");
  });

  test("la de balde NO se apunta como «la primera», o el ciclo moriría en la segunda", () => {
    // `if (m_FirstQuickItem == MAX && !GENERIC)` (vgui_quickslot.h:212).
    const c = new Ciclador();
    const mundo = { armaEnMano: ARCO, flechas: FLECHAS };
    c.elegir("arrow", mundo);
    assert.equal(c.primerId, null, "la infinita no cuenta");
    c.elegir("arrow", mundo);
    assert.equal(c.primerId, "proj_arrow_fire");
  });

  test("aceptar la de balde manda GENERIC_ARROW y no un número", () => {
    const c = new Ciclador();
    c.elegir("arrow", { armaEnMano: ARCO, flechas: FLECHAS });
    const o = c.confirmar();
    assert.equal(o.que, "elegirMunicion");
    assert.equal(o.infinita, true);
    assert.equal(o.comando, "selectarrow GENERIC_ARROW");
    assert.equal(o.id, INFINITAS.flecha.id);
  });
});

describe("las doce teclas y las treinta y seis ranuras", () => {
  const ESPADA = { que: "empunar", id: "swords_rsword", nombre: "Rusty Sword" };

  test("hay 36 ranuras con 12 teclas: MAX_QUICKSLOTS", () => {
    assert.equal(MAX_RANURAS, 36);
    assert.equal(TECLAS_DE_RANURA, 12);
    assert.equal(new Ranuras().ranuras.length, 36);
  });

  test("aguantar dos segundos GRABA lo que llevas puesto", () => {
    const r = new Ranuras();
    r.pulsar(1);
    assert.equal(r.paso(1.9, ESPADA), null, "todavía no");
    const g = r.paso(0.2, ESPADA);
    assert.equal(g.ranura, 0);
    assert.equal(g.grabado.nombre, "Rusty Sword");
  });

  test("y soltar antes de los dos segundos USA lo que hubiera", () => {
    const r = new Ranuras({ guardadas: [ESPADA] });
    r.pulsar(1);
    r.paso(0.3, null);
    const o = r.soltar(1);
    assert.equal(o.id, "swords_rsword");
    assert.equal(o.ranura, 0);
  });

  test("una ranura vacía no dice nada: ni pitido ni aviso", () => {
    const r = new Ranuras();
    r.pulsar(4);
    r.paso(0.2, ESPADA);
    assert.equal(r.soltar(4), null);
  });

  test("soltar DESPUÉS de grabar no usa la ranura además", () => {
    // `m_StartedHolding = 0` al grabar, y al soltar `if (!m_StartedHolding)
    // return;` corta (vgui_quickslot.h:349).
    const r = new Ranuras();
    r.pulsar(1);
    r.paso(2.5, ESPADA);
    assert.equal(r.soltar(1), null, "grabar y usar en la misma pulsación sería un lío");
  });

  test("grabar con las manos vacías VACÍA la ranura", () => {
    const r = new Ranuras({ guardadas: [ESPADA] });
    r.pulsar(1);
    const g = r.paso(2.5, null);
    assert.equal(g.grabado, null);
    assert.equal(r.ranuras[0], null);
  });

  test("el desplazamiento de +12 lleva la F1 a la ranura 13", () => {
    const r = new Ranuras();
    assert.equal(r.indiceDe(1), 0);
    r.desplazar(12);
    assert.equal(r.indiceDe(1), 12);
    r.desplazar(24);
    assert.equal(r.indiceDe(12), 35, "la última tecla del último juego es la 36");
  });

  test("y no se sale de las 36 por arriba", () => {
    const r = new Ranuras();
    r.desplazar(24);
    // 12 teclas + 24 = 36, o sea que la última cabe justa. Un desplazamiento
    // mayor no existe: `desplazar` sólo admite 0, 12 y 24.
    r.desplazar(99);
    assert.equal(r.desplazamiento, 0);
  });

  test("dos segundos es un número a pelo, sin cvar", () => {
    assert.equal(AGUANTE_PARA_GRABAR, 2);
    assert.equal(ESPERA, 2.5, "esta otra SÍ es un cvar: ms_quickslot_timeout");
  });
});

describe("el menú principal", () => {
  /** Lo que `gamemenu.res` da de verdad, con sus huecos y sus separadores. */
  const ENTRADAS = [
    { n: 1, etiqueta: "#GameUI_GameMenu_ResumeGame", texto: "Resume game", comando: "ResumeGame", soloEnJuego: true },
    { n: 2, etiqueta: "#GameUI_GameMenu_Disconnect", texto: "Disconnect", comando: "Disconnect", soloEnJuego: true },
    { n: 3, etiqueta: "", texto: "", comando: "", soloEnJuego: true },
    { n: 7, etiqueta: "", texto: "", comando: "", noMulti: true },
    { n: 8, etiqueta: "Visit a Kingdom", texto: "Visit a Kingdom", comando: "OpenServerBrowser" },
    { n: 9, etiqueta: "Establish a Kingdom", texto: "Establish a Kingdom", comando: "OpenCreateMultiplayerGameDialog" },
    { n: 11, etiqueta: "", texto: "", comando: "" },
    { n: 13, etiqueta: "Name Character", texto: "Name Character", comando: "OpenOptionsDialog" },
    { n: 14, etiqueta: "Options", texto: "Options", comando: "OpenOptionsDialog" },
    { n: 15, etiqueta: "#GameUI_GameMenu_Quit", texto: "Quit", comando: "Quit" },
  ];

  test("sin partida no salen «Resume game» ni «Disconnect»", () => {
    const v = entradasVisibles(ENTRADAS, { enJuego: false });
    assert.ok(!v.some((e) => e.comando === "ResumeGame"));
    assert.ok(!v.some((e) => e.comando === "Disconnect"));
  });

  test("y con partida sí, con su separador", () => {
    const v = entradasVisibles(ENTRADAS, { enJuego: true });
    assert.equal(v.length, 9, "las diez menos la de `notmulti`");
    assert.equal(v[0].comando, "ResumeGame");
  });

  test("«Name Character» y «Options» comparten comando y van a sitios DISTINTOS", () => {
    // En el archivo del juego las dos dicen `OpenOptionsDialog`. Se separan por
    // la etiqueta porque nombrar al personaje no es cambiar las teclas.
    const nombrar = ENTRADAS.find((e) => e.texto === "Name Character");
    const opciones = ENTRADAS.find((e) => e.texto === "Options");
    assert.equal(nombrar.comando, opciones.comando);
    assert.equal(quehace(nombrar).que, "nombrar");
    assert.equal(quehace(opciones).que, "opciones");
  });

  test("las tres en blanco son separadores, no opciones rotas", () => {
    const seps = ENTRADAS.filter((e) => quehace(e).que === "separador");
    assert.equal(seps.length, 3);
    assert.deepEqual(seps.map((e) => e.n), [3, 7, 11]);
  });

  test("lo que no se puede hacer hoy se ve y dice por qué", () => {
    // De las tres que había apagadas queda UNA. «Visit a Kingdom» se encendió en
    // el 34 y «Establish a Kingdom» en el 36, cuando sus ventanas existieron.
    // «Quit» no se va a encender nunca: un navegador no cierra la pestaña que no
    // abrió él, y eso no es una carencia del port.
    for (const cmd of ["Quit"]) {
      assert.equal(COMANDOS[cmd].sirve, false, cmd);
      assert.ok(COMANDOS[cmd].porque, `${cmd} tiene que decir por qué`);
    }
  });

  test("las dos entradas de partida abren, porque sus ventanas existen", () => {
    assert.equal(COMANDOS.OpenServerBrowser.sirve, true);
    assert.equal(COMANDOS.OpenServerBrowser.que, "servidores");
    assert.equal(COMANDOS.OpenCreateMultiplayerGameDialog.sirve, true);
    assert.equal(COMANDOS.OpenCreateMultiplayerGameDialog.que, "crearPartida");
  });

  test("las flechas saltan los separadores", () => {
    const v = entradasVisibles(ENTRADAS, { enJuego: true });
    // El índice 2 es el separador; bajando desde el 1 hay que caer en el 3.
    assert.equal(quehace(v[2]).que, "separador");
    assert.equal(siguienteElegible(v, 1, 1), 3);
  });

  test("y dan la vuelta", () => {
    const v = entradasVisibles(ENTRADAS, { enJuego: false });
    const ultima = v.length - 1;
    assert.equal(siguienteElegible(v, ultima, 1), siguienteElegible(v, -1, 1));
  });

  test("un menú de puros separadores no deja elegir nada, y no se cuelga", () => {
    const solo = [{ etiqueta: "", comando: "" }, { etiqueta: "", comando: "" }];
    assert.equal(siguienteElegible(solo, 0, 1), -1);
    assert.equal(siguienteElegible([], 0, 1), -1);
  });
});
