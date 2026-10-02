import test from "node:test";
import assert from "node:assert/strict";
import { InteraccionesNpc } from "../src/juego/interacciones.js";
import { partirGuion } from "../src/play/guion.js";
import { leerMision } from "../src/play/misiones.js";

const ficha = partirGuion(`
{ game_spawn
 setvard ROTULO First
}
{ game_menu_getoptions
 local reg.mitem.title ROTULO
 local reg.mitem.type callback
 local reg.mitem.callback conversar
 menuitem.register
}
{ conversar
 setvard ROTULO Again
 quest set PARAM1 charla 1
 playanim once nod
 calleventtimed 1 despedida
}
{ despedida
 saytext Goodbye
}
{ game_menu_cancel
 quest set PARAM1 cancelado 1
}
{ quitar_area
 local OBJETIVO $get_by_name(spawner)
 deleteent OBJETIVO remove
}
`);

function partida() {
  const npcs = new Map([0, 1].map(id => [id, { id, ficha: { script: "prueba/npc", nombre: `NPC ${id}` }, donde: [1, 2, 3] }]));
  const guardados = [], dicho = [], animaciones = [], borrados = [];
  const sesion = { personaje: { id: "primero", misiones: [] }, guardar() { guardados.push(this.personaje.id); } };
  const servicio = new InteraccionesNpc({
    sesion, guiones: { guiones: { "prueba/npc": ficha } },
    npcPorId: id => npcs.get(id), areas: [{ nombre: "spawner" }],
    suceso: (tipo, texto) => dicho.push({ tipo, texto }),
    animar: (npc, nombre) => animaciones.push([npc.id, nombre]),
    borrarDelMundo: nombre => borrados.push(nombre),
  });
  return { servicio, sesion, npcs, guardados, dicho, animaciones, borrados };
}

test("conserva la conversación por entidad, pero lee el personaje actual", async () => {
  const p = partida(), anterior = p.sesion.personaje;
  assert.equal((await p.servicio.pedir(0)).opciones[0].titulo, "First");
  p.sesion.personaje = { id: "segundo", misiones: [] };
  p.servicio.elegido(0, 0);
  assert.equal(leerMision(anterior, "charla"), "0");
  assert.equal(leerMision(p.sesion.personaje, "charla"), "1");
  assert.deepEqual(p.guardados, ["segundo"]);
  assert.deepEqual(p.animaciones, [[0, "nod"]]);
  assert.equal((await p.servicio.pedir(0)).opciones[0].titulo, "Again");
  assert.equal((await p.servicio.pedir(1)).opciones[0].titulo, "First");
  assert.equal((await partida().servicio.pedir(0)).opciones[0].titulo, "First");
});

test("el reloj pertenece a su partida y el temporizador produce un efecto", async () => {
  const a = partida(), b = partida();
  await a.servicio.pedir(0);
  a.servicio.elegido(0, 0);
  b.servicio.paso(2);
  a.servicio.paso(0.5);
  assert.deepEqual(a.dicho, []);
  assert.equal(a.servicio.reloj.pendientes, 1);
  a.servicio.paso(0.5);
  assert.match(a.dicho[0].texto, /Goodbye/);
  a.servicio.paso(2);
  assert.equal(a.dicho.length, 1);
  assert.deepEqual(b.dicho, []);
});

test("cancelar ejecuta game_menu_cancel y las entidades se borran sólo en su partida", async () => {
  const a = partida(), b = partida();
  await a.servicio.pedir(0);
  a.servicio.elegido(0, null);
  assert.equal(leerMision(a.sesion.personaje, "cancelado"), "1");
  assert.deepEqual(a.guardados, [], "cancelar conserva la política anterior de guardado");
  const npc = a.npcs.get(0), g = a.servicio.guionDe(npc);
  npc.donde = [9, 8, 7];
  assert.equal(g.npc.origen, "9 8 7");
  g.guion.llamar("quitar_area", []);
  assert.deepEqual(a.borrados, ["spawner"]);
  assert.equal(a.servicio.entidades.porNombre("spawner"), null);
  assert.ok(b.servicio.entidades.porNombre("spawner"));
});

test("sin guion conserva el respaldo y explica que no puede ejecutar la opción", async () => {
  const dicho = [];
  const servicio = new InteraccionesNpc({
    sesion: { personaje: { id: "p" } },
    npcPorId: id => id === 0 ? { id, ficha: { script: "prueba/sin_guion", nombre: "Sin guion" } } : null,
    menus: { opciones: { "prueba/sin_guion": [{ titulo: "Hail", tipo: "callback", juicio: [] }] } },
    suceso: (tipo, texto) => dicho.push({ tipo, texto }),
  });
  assert.equal((await servicio.pedir(0)).opciones[0].titulo, "Hail");
  servicio.elegido(0, 0);
  assert.match(dicho[0].texto, /no ported script/);
  servicio.elegido(0, null);
  assert.equal(dicho.length, 1);
  assert.equal((await servicio.pedir(null)).nombre, "You");
  assert.ok((await servicio.pedir(null)).opciones.length > 0);
});
