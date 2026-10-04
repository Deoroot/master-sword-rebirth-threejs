// EL BRILLO EN EL MODELO DE LOS DEMÁS, Y LAS IMÁGENES DEL HUD — experimento 95, pieza E.
//
// Dos capas, como siempre:
//
//   1. LA REGLA (`src/play/brillo.js` y la parte nueva de
//      `src/play/efectospantalla.js`), con los números del motor escritos A
//      MANO al lado de su cita (el 75).
//   2. EL CAMINO: una `Partida` de verdad con la rata del mod envenenando a
//      Ana con Beto al lado, mirando las FOTOS que salen por `repartir()` hacia
//      el buzón de cada uno; y un `GuionDelJugador` con la ficha horneada que
//      corre `ext_hud_icon` de player/externals.script. Nadie llama a
//      `_brillo` ni a `leerIcono` a mano.
//
// Lo que se VE —la cáscara verde sobre el modelo de Ana en la pantalla de
// Beto— lo mide la sonda (`sondas/brillo95.mjs`), con píxeles.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  FX_CASCARA, estadoDelBrillo, brilloDeLaEntidad, podarBrillos, separacionDeLaCascara, cascaraDe, mismoBrillo,
} from "../src/play/brillo.js";
import { leerBrillo, leerIcono, IconosDeEstado, ICONO, archivoDeImagen } from "../src/play/efectospantalla.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { Guion, partirGuion, COMANDOS } from "../src/play/guion.js";
import { leerFichaNpc, modeloYAnimaciones, RELACION } from "../src/bsp/script.js";
import { Fauna } from "../src/red/fauna.js";
import { Partida } from "../src/red/partida.js";
import { mundoLiso } from "../src/red/liso.js";
import { AlmacenMemoria } from "../src/juego/almacen.js";
import { MENSAJE, abrir } from "../src/red/protocolo.js";
import { cargarGuion } from "../tools/scriptsmsr.mjs";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const HAY_MOD = existsSync(SCRIPTS);
const EFECTOS = "build/msr/efectosguion.json";
const JUGADOR = "build/msr/jugador.json";
const HAY_EFECTOS = existsSync(EFECTOS) && existsSync(JUGADOR);

// ── 1. LA REGLA DEL BRILLO ─────────────────────────────────────────────────

describe("lo que viaja: `renderfx`/`rendercolor`/`renderamt` (mseffects.cpp:340-344, delta.lst)", () => {
  // La línea del veneno: `effect glow ent_me (75,215,0) 72 EFFECT_DURATION EFFECT_DURATION`.
  const veneno = leerBrillo(["glow", "ent_me", "(75,215,0)", "72", "5", "5"]);

  test("al ponerlo: `kRenderFxGlowShell` = 19, el color y 72", () => {
    assert.equal(FX_CASCARA, 19, "const.h:706: el vigésimo del enum desde kRenderFxNone = 0");
    assert.deepEqual(estadoDelBrillo(veneno, 0), { fx: 19, color: [75, 215, 0], cantidad: 72 });
  });

  test("`renderamt` es un `int` de 8 bits: TRUNCA (72·(1−0,3/5) = 67,68 → 67)", () => {
    // El desvanecido empieza en `inicio + duración − desvanecido` = 0 (:374).
    assert.equal(estadoDelBrillo(veneno, 0.3).cantidad, 67);
    // Y una cantidad de 300 en el guion sale 300 & 0xFF = 44 por el cable.
    const enorme = leerBrillo(["glow", "ent_me", "(1,2,3)", "300", "-1", "0"]);
    assert.equal(estadoDelBrillo(enorme, 100).cantidad, 44);
  });

  test("a los `duración` segundos se apaga (`renderfx = kRenderFxNone`, :367-372), y si el objetivo muere", () => {
    assert.equal(estadoDelBrillo(veneno, 4.99)?.fx, 19);
    assert.equal(estadoDelBrillo(veneno, 5), null);
    assert.equal(estadoDelBrillo(veneno, 1, { vivo: false }), null, "MiB DEC2007a: se quita al morir");
  });

  test("duración negativa: brilla PARA SIEMPRE con la cantidad entera (:925-926)", () => {
    const siempre = leerBrillo(["glow", "ent_me", "(255,0,0)", "40", "-1", "3"]);
    assert.deepEqual(estadoDelBrillo(siempre, 1e6), { fx: 19, color: [255, 0, 0], cantidad: 40 });
  });

  test("dos controladores: manda el más NUEVO de los vivos; el caducado se poda", () => {
    const viejo = { ...leerBrillo(["glow", "ent_me", "(255,0,0)", "50", "2", "0"]), desde: 0 };
    const nuevo = { ...leerBrillo(["glow", "ent_me", "(0,0,255)", "60", "10", "0"]), desde: 1 };
    assert.deepEqual(brilloDeLaEntidad([viejo, nuevo], 1.5).color, [0, 0, 255]);
    assert.deepEqual(brilloDeLaEntidad([viejo, nuevo], 3).color, [0, 0, 255]);
    assert.deepEqual(podarBrillos([viejo, nuevo], 3), [nuevo]);
    // Con el nuevo ya caducado y el viejo vivo, vuelve el viejo.
    const corto = { ...nuevo, duracion: 0.2 };
    assert.deepEqual(brilloDeLaEntidad([viejo, corto], 1.5).color, [255, 0, 0]);
  });

  test("la delta compara el brillo: un cambio de cantidad es un cambio de foto", () => {
    assert.equal(mismoBrillo(null, null), true);
    assert.equal(mismoBrillo(estadoDelBrillo(veneno, 0), null), false);
    assert.equal(mismoBrillo(estadoDelBrillo(veneno, 0), estadoDelBrillo(veneno, 0.3)), false);
  });
});

describe("lo que dibuja el cliente: una CÁSCARA (gl_studio.c:2292-2293, :1990-1991, :3065)", () => {
  test("`shellscale = max(1/128, renderamt/128)` unidades", () => {
    assert.equal(separacionDeLaCascara(72), 0.5625);
    assert.equal(separacionDeLaCascara(0), 1 / 128, "con cantidad 0 SIGUE habiendo cáscara");
    assert.equal(separacionDeLaCascara(1), 1 / 128);
    assert.equal(separacionDeLaCascara(255), 255 / 128);
  });

  test("el color es el de la entidad a alfa 255, y la cantidad NO lo apaga", () => {
    const k = cascaraDe({ fx: 19, color: [75, 215, 0], cantidad: 0 });
    assert.deepEqual(k.color, [75 / 255, 215 / 255, 0]);
    assert.equal(k.separacion, 1 / 128);
  });

  test("CONTROL NEGATIVO: sin `kRenderFxGlowShell` no hay cáscara", () => {
    assert.equal(cascaraDe(null), null);
    assert.equal(cascaraDe({ fx: 0, color: [75, 215, 0], cantidad: 72 }), null);
  });
});

// ── 2. LA REGLA DE LAS IMÁGENES ────────────────────────────────────────────

describe("`hud.addimgicon` / `hud.killimgicon` (scriptcmds.cpp:3765-3875)", () => {
  test("la línea de la epilepsia: tipo 2, cuatro porcentajes y la duración", () => {
    const i = leerIcono("hud.addimgicon", ["ent_me", "bepilepsy2", "bepilepsy2", "15", "20", "75", "60", "0.25"]);
    assert.equal(i.aQuien, "ent_me");
    assert.equal(i.todos, false);
    assert.deepEqual(i.mensaje, { tipo: 2, icono: "bepilepsy2", nombre: "bepilepsy2", x: 15, y: 20, ancho: 75, alto: 60, duracion: Math.fround(0.25) });
  });

  test("menos de ocho parámetros: `ERROR_MISSING_PARMS`, no se manda nada", () => {
    assert.equal(leerIcono("hud.addimgicon", ["ent_me", "a", "b", "1", "2", "3", "4"]), null);
  });

  test("SIN rama `all`: `all` es un objetivo que no se encuentra (no `todos`)", () => {
    const i = leerIcono("hud.addimgicon", ["all", "vs", "sc4", "40", "0", "20", "10", "3"]);
    assert.equal(i.todos, false);
    assert.equal(i.aQuien, "all");
  });

  test("`atoi` y `WRITE_SHORT`: «12abc» es 12 y 70000 da la vuelta a 4464", () => {
    const i = leerIcono("hud.addimgicon", ["ent_me", "x", "y", "12abc", "70000", "-5", "0", "1"]);
    assert.equal(i.mensaje.x, 12);
    assert.equal(i.mensaje.y, 4464);
    assert.equal(i.mensaje.ancho, -5);
  });

  test("las cadenas se cortan a 80 (no a 85, como los iconos de estado)", () => {
    const largo = "a".repeat(100);
    const i = leerIcono("hud.addimgicon", ["ent_me", largo, largo, "0", "0", "1", "1", "1"]);
    assert.equal(i.mensaje.icono.length, 80);
    assert.equal(i.mensaje.nombre.length, 80);
  });

  test("`killimgicon`: con un parámetro manda «all»; con dos, el nombre", () => {
    assert.deepEqual(leerIcono("hud.killimgicon", ["ent_owner"]).mensaje, { tipo: ICONO.QUITA_IMG, nombre: "all" });
    assert.deepEqual(leerIcono("hud.killimgicon", ["ent_owner", "rehab"]).mensaje, { tipo: ICONO.QUITA_IMG, nombre: "rehab" });
  });

  test("la ruta horneada: `gfx/vgui/<nombre>.tga` → `hud/imagen/<nombre>.png`", () => {
    assert.equal(archivoDeImagen("bepilepsy1"), "hud/imagen/bepilepsy1.png");
    assert.equal(archivoDeImagen(""), null);
  });
});

describe("el cliente: `VGUI_ImgIcon` y `AddImg` (ui/vgui_status.h:109-179, :279-307)", () => {
  const pon = (nombre, dur, extra = {}) => ({ tipo: ICONO.PON_IMG, icono: nombre, nombre, x: 15, y: 20, ancho: 75, alto: 60, duracion: dur, ...extra });

  test("porcentajes de la pantalla, truncados a `int` (:293-302)", () => {
    const v = new IconosDeEstado();
    v.recibir(pon("bepilepsy1", 4), 0);
    // 1200×800: 15 % de 1200 = 180; 20 % de 800 = 160; 75 % = 900; 60 % = 480.
    assert.deepEqual(v.pasoDeImagenes(1, 1200, 800), [{ icono: "bepilepsy1", nombre: "bepilepsy1", x: 180, y: 160, ancho: 900, alto: 480 }]);
    // 333 px: 15 % = 49,95 → 49 (trunca, no redondea).
    assert.equal(v.pasoDeImagenes(1, 333, 800)[0].x, 49);
  });

  test("un nombre que YA está no se añade y NO reinicia el reloj (al revés que un icono de estado)", () => {
    const v = new IconosDeEstado();
    v.recibir(pon("bepilepsy2", 1), 0);
    v.recibir(pon("bepilepsy2", 10), 0.5);
    assert.equal(v.imagenes.length, 1);
    assert.equal(v.pasoDeImagenes(0.9, 100, 100).length, 1);
    assert.equal(v.pasoDeImagenes(1.0, 100, 100).length, 0, "caduca con su PRIMERA duración");
    // Y caducada, ya se puede volver a poner.
    v.recibir(pon("bepilepsy2", 1), 1.2);
    assert.equal(v.pasoDeImagenes(1.3, 100, 100).length, 1);
  });

  test("sólo −1 EXACTO es para siempre (`IsActive`, :162-165)", () => {
    const v = new IconosDeEstado();
    v.recibir(pon("a", -1), 0);
    v.recibir(pon("b", -2), 0);
    assert.deepEqual(v.pasoDeImagenes(1e5, 100, 100).map((x) => x.nombre), ["a"]);
  });

  test("un nombre «all» no se pone (:415)", () => {
    const v = new IconosDeEstado();
    v.recibir(pon("all", 5), 0);
    assert.equal(v.imagenes.length, 0);
  });

  test("`killimgicon` quita la PRIMERA con ese nombre o todas con «all»; los iconos de estado se quedan", () => {
    const v = new IconosDeEstado();
    v.recibir({ tipo: ICONO.PON_ESTADO, icono: "hud/status/alpha_dot_poison", nombre: "DOT_poison", duracion: 9 }, 0);
    v.recibir(pon("sc1", 3), 0);
    v.recibir(pon("sc2", 3), 0);
    v.recibir({ tipo: ICONO.QUITA_IMG, nombre: "sc1" }, 0.1);
    assert.deepEqual(v.imagenes.map((x) => x.nombre), ["sc2"]);
    v.recibir({ tipo: ICONO.QUITA_IMG, nombre: "all" }, 0.1);
    assert.equal(v.imagenes.length, 0);
    assert.equal(v.lista.length, 1, "REMOVE_IMG no toca `m_Status`");
  });

  test("`killicons` (tipo 0) quita las dos listas (`KillAll`, :349-353)", () => {
    const v = new IconosDeEstado();
    v.recibir({ tipo: ICONO.PON_ESTADO, icono: "x", nombre: "x", duracion: 9 }, 0);
    v.recibir(pon("sc1", 3), 0);
    v.recibir({ tipo: ICONO.QUITA_TODO }, 0.1);
    assert.equal(v.lista.length + v.imagenes.length, 0);
  });

  test("y `killstatusicon all` NO quita las imágenes (`KillAllStatus`)", () => {
    const v = new IconosDeEstado();
    v.recibir(pon("sc1", 3), 0);
    v.recibir({ tipo: ICONO.QUITA_ESTADO, nombre: "all" }, 0.1);
    assert.equal(v.imagenes.length, 1);
  });
});

// ── 3. EL CAMINO DE LAS IMÁGENES: el guion del jugador, por texto ───────────

describe("el guion del jugador corre `ext_hud_icon` (player/externals.script:2911-2913)", { skip: !HAY_EFECTOS }, () => {
  const ficha = HAY_EFECTOS ? JSON.parse(readFileSync(JUGADOR, "utf8")) : null;
  const tabla = HAY_EFECTOS ? new TablaDeEfectos(JSON.parse(readFileSync(EFECTOS, "utf8"))) : null;
  const montar = ({ pantalla = true } = {}) => {
    const llegado = [];
    const g = new GuionDelJugador({
      ficha, efectos: tabla, ahora: () => 0,
      personaje: { id: "jugador1", nombre: "Ana", vida: 30, mana: 10, habilidades: {} },
      maximos: () => ({ vida: 30, mana: 10 }), dar: () => {}, suceso: () => {}, herir: () => {},
      pantalla: pantalla ? (p) => llegado.push(p) : null,
    });
    return { g, llegado };
  };

  test("los dos comandos están en `COMANDOS` (scriptcmds.cpp:61, :64)", () => {
    assert.ok(COMANDOS.has("hud.addimgicon") && COMANDOS.has("hud.killimgicon"));
  });

  test("`ext_hud_icon 3 cnt 40 0 20 30 0.75` (la cuenta atrás del fútbol) llega a la pantalla como imagen", () => {
    const { g, llegado } = montar();
    assert.ok(g.llamar("ext_hud_icon", ["3", "cnt", "40", "0", "20", "30", "0.75"]), "el evento existe en la ficha horneada");
    const i = llegado.find((p) => p.tipo === "icono");
    assert.ok(i, JSON.stringify(llegado));
    assert.deepEqual(i.mensaje, { tipo: 2, icono: "3", nombre: "cnt", x: 40, y: 0, ancho: 20, alto: 30, duracion: Math.fround(0.75) });
    assert.ok(!g.guion.noSoportados.some((x) => /imgicon/.test(x.nombre)), JSON.stringify(g.guion.noSoportados));
  });

  test("`ext_epilepsy_time_begin`: las dos imágenes, `bepilepsy2` y luego `bepilepsy1`", () => {
    const { g, llegado } = montar();
    g.llamar("ext_epilepsy_time_begin", []);
    const nombres = llegado.filter((p) => p.tipo === "icono" && p.mensaje.tipo === 2).map((p) => p.mensaje.nombre);
    assert.deepEqual(nombres, ["bepilepsy2", "bepilepsy1"]);
  });

  test("CONTROL NEGATIVO: sin puerta de pantalla no se traga: se apunta «(sin pantalla)»", () => {
    const { g } = montar({ pantalla: false });
    g.llamar("ext_hud_icon", ["3", "cnt", "40", "0", "20", "30", "0.75"]);
    assert.ok(g.guion.noSoportados.some((x) => /sin pantalla/.test(x.nombre)), JSON.stringify(g.guion.noSoportados));
  });

  test("EL CASE, por texto: sin gancho (un NPC) los dos se apuntan con su nombre", () => {
    const texto = "{ e\n hud.addimgicon ent_me vs sc4 40 0 20 10 3\n hud.killimgicon ent_me sc4\n}";
    const sin = new Guion({ eventos: partirGuion(texto).eventos });
    sin.llamar("e", []);
    assert.deepEqual(sin.noSoportados.map((x) => x.nombre), ["hud.addimgicon", "hud.killimgicon"]);
  });

  test("`hud.addimgicon all …`: el motor no tiene esa rama, así que se apunta y no llega", () => {
    const { g, llegado } = montar();
    const texto = "{ e\n hud.addimgicon all vs sc4 40 0 20 10 3\n}";
    const otro = new Guion({ eventos: partirGuion(texto).eventos });
    otro.entorno.comandoDePantalla = g.guion.entorno.comandoDePantalla;
    otro.llamar("e", []);
    assert.equal(llegado.length, 0);
    assert.ok(otro.noSoportados.some((x) => /a otra entidad \(all\)/.test(x.nombre)), JSON.stringify(otro.noSoportados));
  });
});

// ── 4. EL CAMINO DEL BRILLO: con servidor, en las FOTOS ────────────────────

const RATA = "monsters/giantrat";
const SECUENCIAS = [
  { indice: 0, nombre: "idle1", fps: 15, fotogramas: 30, bucle: true, actividad: 1, pesoActividad: 15, avance: [0, 0, 0] },
  { indice: 1, nombre: "walk", fps: 30, fotogramas: 60, bucle: true, actividad: 3, pesoActividad: 1, avance: [-72, 0, 0] },
  { indice: 2, nombre: "run", fps: 30, fotogramas: 25, bucle: true, actividad: 4, pesoActividad: 1, avance: [76, 0, 0] },
  { indice: 3, nombre: "attack", fps: 30, fotogramas: 30, bucle: false, actividad: 28, pesoActividad: 1, avance: [0, 0, 0] },
];
function dado(semilla = 1) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
function buzon() {
  const dentro = [];
  return {
    dentro, enviar: (t) => dentro.push(abrir(t)), al: () => () => {},
    fotos: () => dentro.filter((m) => m.t === MENSAJE.FOTO),
    textos: () => dentro.filter((m) => m.t === MENSAJE.TEXTO).map((m) => m.texto),
  };
}

/** La partida de test/efectos93b.test.mjs (y del 92): una rata del mod a −1,2 m. */
async function partidaConRata({ params = null, jugadores = ["Ana", "Beto"] } = {}) {
  const ficha = modeloYAnimaciones(leerFichaNpc(SCRIPTS, RATA));
  const censo = {
    mapa: "liso", unidadesPorMetro: 39.37, razas: [], modelos: [{ clave: "b", carpeta: "x" }],
    colocados: [{
      clase: "msmonster_giantrat", script: RATA, clave: "b", nombre: ficha.nombre ?? "Giant Rat", hp: ficha.hp ?? 10,
      ancho: ficha.ancho, alto: ficha.alto, parado: "idle1", andando: "walk", piel: 0,
      escena: [-1.2, 0, 0], yaw: 0, luz: [0, 0, 0], hostil: false,
      relacion: ficha.relacion ?? RELACION.RECELO, ia: { ...ficha.ia },
    }],
  };
  const mundo = await mundoLiso();
  const fauna = new Fauna({
    censo, mundo, azar: dado(7),
    secuenciasPorClave: new Map([["b", SECUENCIAS]]),
    cajasPorClave: new Map([["b", { min: [-16, -16, 0], max: [16, 16, 32] }]]),
  });
  const partida = new Partida({
    mundo, almacen: new AlmacenMemoria(), fauna, ahora: () => 0,
    aparicion: { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 0.1, 0] } },
    guiones: { guiones: { [RATA]: cargarGuion(RATA) } },
    efectos: JSON.parse(readFileSync(EFECTOS, "utf8")),
    fichaDelJugador: JSON.parse(readFileSync(JUGADOR, "utf8")),
    paramsDeBicho: params,
  });
  const quienes = [];
  for (const nombre of jugadores) {
    const b = buzon();
    const c = partida.conectar(b, { nombre });
    await c.sesion.arrancar();
    const p = await c.sesion.crear({ nombre, genero: "female" });
    await partida.recibir(c.id, { t: MENSAJE.ELEGIR, id: p.id });
    quienes.push({ c, b, p });
  }
  const rata = fauna.manada.instancias[0];
  // `_paso` y luego `repartir`, que es lo que hace el bucle del servidor: las
  // fotos salen por donde salen en el juego, no por `foto(c)` a mano.
  const pasar = (segundos) => { for (let k = 0; k < Math.round(segundos * 100); k++) { partida._paso(); partida.repartir(); } };
  const pegar = (q) => partida.recibir(q.c.id, {
    t: MENSAJE.PEGAR, id: rata.id, dano: 1, alcance: 60, cubo: "swordsmanship.0", tipo: "slash",
  });
  return { partida, quienes, pasar, pegar };
}

/** El brillo de `id` en cada foto de un buzón, en orden; `undefined` si esa foto no lo trae. */
const brillosDe = (b, id) => b.fotos().map((f) => (f.jugadores ?? []).find((j) => j.id === id)).filter(Boolean).map((j) => j.brillo);

describe("con servidor: el brillo de Ana viaja en SU foto, y Beto la ve brillar", { skip: !HAY_MOD || !HAY_EFECTOS }, () => {
  const VENENO = { [RATA]: ["add_dot_poison"] };

  test("Ana envenenada: en las fotos de Beto, Ana lleva `{fx 19, (75,215,0)}` y la cantidad BAJA; luego se apaga", async () => {
    const { quienes, pasar, pegar } = await partidaConRata({ params: VENENO });
    const [ana, beto] = quienes;
    pasar(0.1);
    await pegar(ana);
    pasar(20);
    assert.ok(ana.b.textos().includes("You have been poisoned!"), "control: el veneno ha caído en Ana");
    const vistos = brillosDe(beto.b, ana.c.id);
    const con = vistos.filter((x) => x);
    assert.ok(con.length >= 2, `fotos de Beto con Ana brillando: ${con.length} de ${vistos.length}`);
    assert.deepEqual(con[0].color, [75, 215, 0]);
    assert.equal(con[0].fx, 19);
    assert.ok(con[0].cantidad <= 72 && con.at(-1).cantidad < con[0].cantidad,
      `desvanece desde el primer instante: ${con[0].cantidad} → ${con.at(-1).cantidad}`);
    // Al acabar, una foto de Beto trae a Ana SIN brillo: la delta lo manda.
    const i = vistos.findIndex((x) => x);
    assert.ok(vistos.slice(i).some((x) => x === null), "el apagado viaja");
  });

  test("CONTROL NEGATIVO, el mismo instante: Beto no brilla en las fotos de Ana", async () => {
    const { quienes, pasar, pegar } = await partidaConRata({ params: VENENO });
    const [ana, beto] = quienes;
    pasar(0.1);
    await pegar(ana);
    pasar(6);
    assert.ok(brillosDe(beto.b, ana.c.id).some((x) => x), "control positivo: Ana sí brilla");
    assert.ok(brillosDe(ana.b, beto.c.id).every((x) => !x), JSON.stringify(brillosDe(ana.b, beto.c.id).filter(Boolean)));
  });

  test("CONTROL NEGATIVO: la misma rata sin `add_dot_poison` muerde y nadie brilla", async () => {
    const { partida, quienes, pasar, pegar } = await partidaConRata();
    const [ana, beto] = quienes;
    pasar(0.1);
    await pegar(ana);
    pasar(8);
    assert.ok(partida.costura().bichos[0].recibidos.game_dodamage >= 1, "control: ha mordido");
    assert.ok(brillosDe(beto.b, ana.c.id).every((x) => !x));
  });

  test("con DELTA: lo que Beto CREE de Ana al final es «sin brillo» — el apagado viaja aunque nada más cambie", async () => {
    const { partida, quienes, pegar } = await partidaConRata({ params: VENENO });
    const [ana, beto] = quienes;
    // Beto reconoce cada foto (`fotoReconocida`), así que lo que no cambia no
    // viaja y Beto se queda con lo último que le llegó. LECTURA VIEJA de esta
    // prueba: «el brillo de una Ana QUIETA llega igual», y se quedó VERDE con
    // `igual` sin mirar el brillo — Ana no está quieta mientras la muerde el
    // veneno: su VIDA cambia cada segundo y la arrastra a la foto. Donde no
    // cambia nada más es al APAGARSE: sin el brillo en `igual`, Beto la
    // seguiría viendo verde para siempre.
    const reconocer = () => { const f = beto.b.fotos().at(-1); if (f) beto.c.fotoReconocida = f.seq; };
    const envenenada = () => ana.c.anfitrionDeEfectos?.efectos?.activos?.some?.((e) => e.id === "DOT_poison") ?? false;
    const paso = () => { partida._paso(); partida.repartir(); reconocer(); };
    for (let k = 0; k < 30; k++) paso();
    await pegar(ana);
    // Hasta que el veneno caiga, y luego hasta que ACABE (a los ~15 s, medido:
    // la rata vuelve a morder a los ~20 y Ana sigue viva hasta los ~26).
    let k = 0;
    while (!envenenada() && k < 1000) { paso(); k++; }
    while (envenenada() && k < 3000) { paso(); k++; }
    for (let j = 0; j < 50; j++) paso();
    const vistos = brillosDe(beto.b, ana.c.id);
    assert.ok(vistos.some((x) => x), "control positivo: con delta, el brillo llega");
    assert.equal(envenenada(), false, "premisa: el veneno ya acabó en el servidor");
    assert.equal(ana.c.vivo, true, "premisa: Ana sigue viva (morir también apaga el brillo, :367)");
    assert.equal(vistos.at(-1), null, `lo último que Beto sabe de Ana: ${JSON.stringify(vistos.at(-1))}`);
  });
});
