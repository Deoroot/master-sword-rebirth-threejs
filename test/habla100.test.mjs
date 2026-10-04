// LO QUE SE DICE VA A LA CONSOLA DEL CHAT — experimento 100.
//
// El HUD del mod tiene dos `VGUI_EventConsole` (vgui_hud.cpp:189 y :197) y un
// `enum` para no confundirlas (`CON_EVENT`, `CON_SAYTEXT`, :86-90). A la segunda
// sólo llega `HUD_SayTextEvent` (:586-591), o sea el `HUDInfoMsg` de tipo 4
// (:469-485), y ese mensaje sólo lo escribe `CMSMonster::Speak`
// (msmonsterserver.cpp:1700-1706, :1721-1727).
//
// Hasta el 100 el `saytext` de un NPC salía en la de sucesos, abajo a la
// derecha. La frase era la buena —probada desde el 33— y el panel no: el 60 de
// CLAUDE.md, «una regla devuelve QUÉ y otra cosa decide DÓNDE».
//
// Lo que estas pruebas NO pueden ver, y por eso hay sonda (`sonda:habla100`):
// que `src/main.js` le haga caso a `panelDeRecado`. Aquí se mide la regla y que
// el recado SALE MARCADO de donde sale en el juego; el reparto en pantalla es
// la costura, y la costura es de la sonda.
//
// Y la trampa del 59: el recado no se escribe a mano. Sale de un guion que
// parte el analizador (`partirGuion`) y corre por `InteraccionesNpc`, que es
// por donde entra el juego.

import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { HABLA, NOMBRE_DE_HABLA, colorDeHabla, panelDeRecado } from "../src/play/chat.js";
import { ConsolaDeSucesos } from "../src/play/hud.js";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { partirGuion } from "../src/play/guion.js";

const AMBAR = "rgb(255, 178, 0)";   // Color(255, 178, 0, 0) — vgui_hud.cpp:478 y :482
const BLANCO = "rgb(255, 255, 255)"; // :476
const VERDE = "rgb(60, 200, 20)";    // :480

const colorDe = (destino) => colorDeHabla(NOMBRE_DE_HABLA[destino.tipo]);

describe("`panelDeRecado`: a qué consola va cada cosa", () => {
  test("lo que dice un NPC va al chat, como SAYTEXT_NPC y en ámbar", () => {
    const d = panelDeRecado({ habla: { rango: 300 } });
    assert.deepEqual(d, { panel: "chat", tipo: HABLA.NPC });
    assert.equal(colorDe(d), AMBAR);
  });

  test("un recado sin marca se queda en la consola de sucesos (`playermessage`, «You receive…»)", () => {
    assert.deepEqual(panelDeRecado(null), { panel: "sucesos" });
    assert.deepEqual(panelDeRecado({}), { panel: "sucesos" });
    assert.deepEqual(panelDeRecado({ instancia: { id: 1 } }), { panel: "sucesos" });
    assert.deepEqual(panelDeRecado({ sesion: {} }), { panel: "sucesos" });
  });

  test("los tres canales de un jugador, cada uno con su color", () => {
    const local = panelDeRecado({ canal: HABLA.LOCAL });
    const global = panelDeRecado({ canal: HABLA.GLOBAL });
    const party = panelDeRecado({ canal: HABLA.PARTY });
    assert.deepEqual(local, { panel: "chat", tipo: HABLA.LOCAL });
    assert.deepEqual(global, { panel: "chat", tipo: HABLA.GLOBAL });
    assert.deepEqual(party, { panel: "chat", tipo: HABLA.PARTY });
    assert.equal(colorDe(local), AMBAR);
    assert.equal(colorDe(global), BLANCO);
    assert.equal(colorDe(party), VERDE);
  });

  test("`canal: 0` es el global y NO «sin canal»: un `if (o.canal)` lo tiraría a sucesos", () => {
    assert.equal(panelDeRecado({ canal: 0 }).panel, "chat");
  });

  test("un canal que no existe no abre la consola del chat", () => {
    for (const canal of [HABLA.NPC, -1, 7, "1", NaN, undefined]) {
      assert.deepEqual(panelDeRecado({ canal }), { panel: "sucesos" }, String(canal));
    }
  });
});

// ── POR DONDE ENTRA EL JUEGO ────────────────────────────────────────────────

const GUION = partirGuion(`
{ game_spawn
	catchspeech say_hi hi hello
}
{ say_hi
	saytext Hello there
	playermessage ent_lastspoke Only for you
}
`);

function mundo() {
  const npc = { id: 7, ficha: { script: "prueba/habla100", nombre: "Bryan the grocer" }, donde: [0, 0, 0] };
  const recados = [];
  const inter = new InteraccionesNpc({
    sesion: { personaje: { id: "P1", nombre: "Ana", misiones: [] } },
    guiones: { guiones: { "prueba/habla100": GUION } },
    npcPorId: (id) => (id === 7 ? npc : null), losNpc: () => [npc],
    dondeEstaElJugador: () => [0.5, 0, 0], unidadesPorMetro: 39.37,
    suceso: (tipo, texto, o) => recados.push({ tipo, texto: String(texto), destino: panelDeRecado(o) }),
  });
  inter.guionDe(npc);
  for (let k = 0; k < 120; k++) inter.paso(1 / 60);
  recados.length = 0;
  return { inter, recados };
}

describe("el recado sale MARCADO de donde sale en el juego", () => {
  test("el `saytext` de un NPC: al chat, SAYTEXT_NPC, ámbar; su `playermessage`, a sucesos", () => {
    const { inter, recados } = mundo();
    const r = inter.hablaElJugador("hi");
    assert.deepEqual(r.contestaron.map((c) => c.evento), ["say_hi"], "control positivo: el NPC oyó y contestó");

    const suya = recados.find((x) => x.texto === 'Bryan the grocer says,  "Hello there"');
    assert.ok(suya, recados.map((x) => x.texto).join(" | "));
    assert.deepEqual(suya.destino, { panel: "chat", tipo: HABLA.NPC });
    assert.equal(colorDe(suya.destino), AMBAR);

    const mensaje = recados.find((x) => x.texto === "Only for you");
    assert.ok(mensaje, recados.map((x) => x.texto).join(" | "));
    assert.deepEqual(mensaje.destino, { panel: "sucesos" });
  });

  test("la opción `say` de un menú (sin cajetín): la frase del jugador va al chat por el canal LOCAL", () => {
    const { inter, recados } = mundo();
    inter.hablaElJugador("hi");
    const mia = recados.filter((x) => x.texto === 'Ana says,  "hi"');
    assert.equal(mia.length, 1, recados.map((x) => x.texto).join(" | "));
    assert.deepEqual(mia[0].destino, { panel: "chat", tipo: HABLA.LOCAL });
  });

  test("desde el cajetín (`yaDicho`) NO se repite: `Speak` la escribe una vez y ya la puso el chat", () => {
    const { inter, recados } = mundo();
    const r = inter.hablaElJugador("hi", { yaDicho: true });
    assert.deepEqual(r.contestaron.map((c) => c.evento), ["say_hi"], "el NPC la oye igual");
    assert.equal(recados.filter((x) => x.texto.startsWith("Ana says")).length, 0, recados.map((x) => x.texto).join(" | "));
    // Y el NPC sí contesta en el chat: la guarda no se ha llevado nada más.
    assert.ok(recados.some((x) => x.texto.startsWith("Bryan the grocer says") && x.destino.panel === "chat"));
  });
});

describe("el orden de llegada entre dos consolas, para quien las lee juntas", () => {
  test("cada línea se lleva su número y dos consolas distintas no lo repiten", () => {
    const sucesos = new ConsolaDeSucesos();
    const chat = new ConsolaDeSucesos();
    sucesos.imprimir("normal", "uno");
    chat.imprimir("npc", "dos");
    sucesos.imprimir("normal", "tres");
    const todas = [sucesos.enLinea(0), sucesos.enLinea(1), chat.enLinea(0)].sort((a, b) => a.n - b.n);
    assert.deepEqual(todas.map((l) => l.texto), ["uno", "dos", "tres"]);
  });
});
