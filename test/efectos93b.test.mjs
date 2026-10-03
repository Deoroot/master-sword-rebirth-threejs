// LO QUE UN EFECTO LE HACE A LA PANTALLA — experimento 93, pieza B.
//
// Dos capas, como siempre:
//
//   1. LA REGLA (`src/play/efectospantalla.js`), con los números del motor
//      escritos A MANO al lado de su cita (el 75: cuando el número ES la
//      regla, no se compara la constante consigo misma).
//   2. EL CAMINO, por donde entra el juego (CLAUDE.md §4, el 59 y el 63):
//      un `GuionDelJugador` de verdad con la ficha y los efectos horneados, y
//      una `Partida` de verdad con una rata del mod que muerde con veneno a
//      uno de DOS jugadores. Nadie llama a `leerFundido` ni a `_pantalla` a
//      mano: lo que se mira es lo que le LLEGA a cada buzón.
//
// Lo que se ve de verdad —el icono en la esquina, el velo verde— lo mide la
// sonda (`sondas/efectosred93.mjs`), con el DOM y con píxeles.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  FFADE, fijo16, leerFundido, leerBrillo, leerIcono, cantidadDelBrillo,
  fundidoAlLlegar, alfaDelFundido, pinturaDelFundido,
  IconosDeEstado, ICONO, archivoDeIcono, vectorDelMotor,
} from "../src/play/efectospantalla.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { Guion, partirGuion } from "../src/play/guion.js";
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

// ── 1. LA REGLA ────────────────────────────────────────────────────────────

describe("lo que el servidor lee de `effect screenfade` (mseffects.cpp:877-904)", () => {
  test("la línea del veneno: 0,2 s, sin aguante, (75,215,0), alfa 30, `fadein`", () => {
    const f = leerFundido(["screenfade", "ent_me", "0.2", "0", "(75,215,0)", "30", "fadein"]);
    assert.equal(f.aQuien, "ent_me");
    assert.equal(f.todos, false);
    // 0,2 · 4096 = 819,2 → 819: `FixedUnsigned16`, hl/util.cpp:1033-1044.
    assert.deepEqual(f.mensaje, { duracion: 819, aguante: 0, banderas: 0, r: 75, g: 215, b: 0, a: 30 });
  });

  test("4.12 fijo: más de 16 s se topa a 0xFFFF y lo negativo es 0", () => {
    assert.equal(fijo16(20), 65535);
    assert.equal(fijo16(15), 61440);
    assert.equal(fijo16(-1), 0);
  });

  test("las banderas se buscan con CONTIENE, y `fadein` no añade nada (FFADE_IN es 0)", () => {
    const b = (s) => leerFundido(["screenfade", "ent_me", "1", "0", "(0,0,0)", "10", s]).mensaje.banderas;
    assert.equal(b("fadein"), 0);
    assert.equal(b("fadeout"), FFADE.OUT);
    assert.equal(b("noblend"), FFADE.MODULATE);
    assert.equal(b("perm"), FFADE.STAYOUT);
    assert.equal(b("fadein,fadeout"), FFADE.OUT, "con las dos palabras, las dos (y la de entrar vale 0)");
    assert.equal(b("fadeinout"), 0, "«fadeinout» NO contiene «fadeout»: `find` busca la palabra entera");
    assert.equal(b(""), 0, "sin séptimo parámetro: no hay `REQPARAMS` y no casa nada");
  });

  test("`all` va a todos; el alfa pasa por `atoi` y `WRITE_BYTE` (256 es 0)", () => {
    const f = leerFundido(["screenfade", "all", "1", "0", "(255,0,0)", "256", "fadein"]);
    assert.equal(f.todos, true);
    assert.equal(f.mensaje.a, 0);
  });

  test("`StringToVec`: un espacio delante del paréntesis es cero (sharedutil.cpp:115-124)", () => {
    assert.deepEqual(vectorDelMotor("(75,215,0)"), [75, 215, 0]);
    assert.deepEqual(vectorDelMotor(" (75,215,0)"), [0, 0, 0]);
    assert.deepEqual(vectorDelMotor("(1,2)"), [1, 2, 0]);
  });
});

describe("la curva del motor: `CL_ParseScreenFade` + `V_FadeAlpha` (xash3d engine/client)", () => {
  const llega = (seg, aguante, banderas, a, t0 = 100) =>
    fundidoAlLlegar({ duracion: fijo16(seg), aguante: fijo16(aguante), banderas, r: 1, g: 2, b: 3, a }, t0);

  test("el del veneno: 30 al llegar, la mitad a 0,1 s, cero a los 0,2 s", () => {
    const sf = llega(0.2, 0, FFADE.IN, 30);
    assert.equal(alfaDelFundido(sf, 100), 30, "al llegar, `fadeSpeed · (fadeEnd − cl.time)` es justo el alfa");
    // 150,04 · 0,09995 = 14,996 → 14: `alpha` es `int` y la asignación TRUNCA
    // (cl_game.c:496). Con un rango «14 a 15» la rotura que quita el truncado
    // salió verde: el número se escribe exacto.
    assert.equal(alfaDelFundido(sf, 100.1), 14);
    assert.equal(alfaDelFundido(sf, 100.21), 0);
  });

  test("EL AGUANTE VA ANTES: con los números de la muerte son 15 s a medias y LUEGO 0,2 s de bajada", () => {
    // `UTIL_ScreenFade(this, Vector(255,0,0), 0.2, 15, 128, FFADE_IN)`, player.cpp:740-741.
    // `fadeReset = hold + cl.time; fadeEnd = duration + fadeReset` (cl_parse.c:2108-2109).
    const sf = llega(0.2, 15, FFADE.IN, 128);
    assert.equal(alfaDelFundido(sf, 100), 128);
    assert.equal(alfaDelFundido(sf, 114.9), 128, "a los 14,9 s sigue entero: `bound(0, …, fadealpha)`");
    const bajando = alfaDelFundido(sf, 115.1);
    assert.ok(bajando > 0 && bajando < 128, `${bajando}`);
    assert.equal(alfaDelFundido(sf, 115.3), 0);
  });

  test("`fadeout` SUBE de 0 al alfa y se queda el aguante", () => {
    const sf = llega(1, 2, FFADE.OUT, 200);
    assert.equal(alfaDelFundido(sf, 100), 0);
    const medio = alfaDelFundido(sf, 100.5);
    assert.ok(medio >= 99 && medio <= 100, `${medio}`);
    assert.equal(alfaDelFundido(sf, 102), 200, "en el aguante");
    assert.equal(alfaDelFundido(sf, 103.1), 0, "pasado `fadeReset` (= fadeEnd + hold)");
  });

  test("duración 0 sin `perm`: el motor no suma `cl.time` y no se ve nunca", () => {
    const sf = llega(0, 5, FFADE.IN, 255);
    assert.equal(alfaDelFundido(sf, 100), 0);
  });

  test("`perm` (STAYOUT) se queda para siempre, y `V_FadeAlpha` le adelanta `fadeEnd`", () => {
    const sf = llega(0.5, 0, FFADE.STAYOUT, 90);
    assert.equal(alfaDelFundido(sf, 500), 90);
    assert.ok(Math.abs(sf.fadeEnd - 500.1) < 1e-9, "`sf->fadeEnd = cl.time + 0.1`, cl_game.c:491");
  });

  test("`noblend` (MODULATE) multiplica: `(c·α + (255−α)·255) >> 8`, opaco", () => {
    const sf = llega(1, 0, FFADE.MODULATE, 255);
    const p = pinturaDelFundido({ ...sf, fader: 10, fadeg: 10, fadeb: 10 }, 255);
    // (10·255 + 0) >> 8 = 9
    assert.deepEqual(p, { modo: "multiplica", rgba: [9, 9, 9, 1] });
    assert.equal(pinturaDelFundido(sf, 0), null, "`if (!alpha) return`");
  });
});

describe("`hud.addstatusicon` y compañía (scriptcmds.cpp:3706-3847)", () => {
  test("la línea del veneno", () => {
    const i = leerIcono("hud.addstatusicon", ["ent_me", "hud/status/alpha_dot_poison", "DOT_poison", "5.0"]);
    assert.deepEqual(i, {
      aQuien: "ent_me", todos: false,
      mensaje: { tipo: 1, icono: "hud/status/alpha_dot_poison", nombre: "DOT_poison", duracion: 5, tga: false },
    });
  });
  test("con menos de tres no manda nada; `killstatusicon` con uno manda «all»; `killicons` es el tipo 0", () => {
    assert.equal(leerIcono("hud.addstatusicon", ["ent_me", "x"]), null);
    assert.deepEqual(leerIcono("hud.killstatusicon", ["ent_me"]).mensaje, { tipo: -1, nombre: "all" });
    assert.deepEqual(leerIcono("hud.killstatusicon", ["ent_me", "combat"]).mensaje, { tipo: -1, nombre: "combat" });
    assert.deepEqual(leerIcono("hud.killicons", ["ent_me"]).mensaje, { tipo: 0 });
  });
  test("el archivo horneado sale del nombre", () => {
    assert.equal(archivoDeIcono("hud/status/alpha_dot_poison"), "hud/estado/alpha_dot_poison.png");
  });
});

describe("`VGUI_Status` del cliente (ui/vgui_status.h)", () => {
  const pon = (nombre, dur, icono = "hud/status/x") => ({ tipo: ICONO.PON_ESTADO, icono, nombre, duracion: dur });

  test("se coloca en (10,10), la barra baja con el tiempo y a su hora se va", () => {
    const I = new IconosDeEstado();
    I.recibir(pon("DOT_poison", 5), 10);
    let v = I.paso(10);
    assert.deepEqual([v[0].x, v[0].y, v[0].anchoBarra], [10, 10, 64]);
    v = I.paso(12.5);
    assert.equal(v[0].anchoBarra, 32, "1 − 2,5/5 = 50 % de 64");
    assert.equal(I.paso(15).length, 0, "`time < m_Time + m_Dur` es estricto");
  });

  test("el mismo nombre NO añade otro: reinicia reloj y duración y se queda con el dibujo de antes (MiB FEB2019_22)", () => {
    const I = new IconosDeEstado();
    I.recibir(pon("DOT_poison", 5, "hud/status/a"), 0);
    I.recibir(pon("DOT_poison", 8, "hud/status/b"), 4);
    const v = I.paso(11);
    assert.equal(v.length, 1);
    assert.equal(v[0].icono, "hud/status/a");
  });

  test("columnas de cinco: el sexto va a (74, 10); `killstatusicon` quita por nombre y un icono «all» no se pone", () => {
    const I = new IconosDeEstado();
    for (let k = 0; k < 6; k++) I.recibir(pon(`n${k}`, 10), 0);
    I.recibir(pon("all", 10), 0);
    const v = I.paso(1);
    assert.equal(v.length, 6);
    assert.deepEqual([v[4].x, v[4].y], [10, 10 + 75 * 4]);
    assert.deepEqual([v[5].x, v[5].y], [74, 10]);
    I.recibir({ tipo: ICONO.QUITA_ESTADO, nombre: "n0" }, 1);
    assert.deepEqual(I.paso(1).map((x) => x.nombre), ["n1", "n2", "n3", "n4", "n5"]);
    I.recibir({ tipo: ICONO.QUITA_TODO }, 1);
    assert.equal(I.paso(1).length, 0);
  });
});

describe("`effect glow` (mseffects.cpp:906-926, `CEntGlow::Think` :361-389)", () => {
  test("con menos de seis parámetros no hace nada (`REQPARAMS(6)`)", () => {
    assert.equal(leerBrillo(["glow", "ent_me", "(0,255,0)", "256", "1"]), null);
  });
  test("entero hasta `duración − desvanecido`, luego baja en línea recta; muerto o caducado, nada", () => {
    const b = leerBrillo(["glow", "ent_me", "(75,215,0)", "72", "5", "2"]);
    assert.equal(cantidadDelBrillo(b, 2), 72);
    assert.equal(cantidadDelBrillo(b, 4), 36);
    assert.equal(cantidadDelBrillo(b, 5), null);
    assert.equal(cantidadDelBrillo(b, 1, { vivo: false }), null);
  });
});

// ── 2. EL CAMINO ───────────────────────────────────────────────────────────

describe("en un jugador sin servidor: el veneno llega a la puerta de la pantalla", { skip: !HAY_EFECTOS }, () => {
  const ficha = HAY_EFECTOS ? JSON.parse(readFileSync(JUGADOR, "utf8")) : null;
  const tabla = HAY_EFECTOS ? new TablaDeEfectos(JSON.parse(readFileSync(EFECTOS, "utf8"))) : null;
  const montar = ({ pantalla = true } = {}) => {
    let t = 0;
    const llegado = [];
    const g = new GuionDelJugador({
      ficha, efectos: tabla, ahora: () => t,
      personaje: { id: "jugador1", nombre: "Ana", vida: 30, mana: 10, habilidades: {} },
      maximos: () => ({ vida: 30, mana: 10 }), dar: () => {}, suceso: () => {}, herir: () => {},
      pantalla: pantalla ? (p) => llegado.push({ t, ...p }) : null,
    });
    const pasar = (s) => { for (let k = 0; k < Math.round(s * 100); k++) { t += 0.01; g.paso(0.01); } };
    return { g, llegado, pasar };
  };
  // El atacante con asa «0», el mismo que usa la prueba de la puerta del 92.
  const RATA = { aplicador: { id: "0", nombre: "Giant Rat", propiedad: (p) => (p === "name" ? "Giant Rat" : "0") } };

  test("`dot_start`: brillo e icono; `dot_effect`: un fundido por mordisco", () => {
    const { g, llegado, pasar } = montar();
    g.efectos.aplicar("effects/dot_poison", ["5.0", "0", "0.4"], RATA);
    pasar(7);
    const icono = llegado.find((p) => p.tipo === "icono");
    assert.ok(icono, JSON.stringify(llegado));
    assert.deepEqual(icono.mensaje, { tipo: 1, icono: "hud/status/alpha_dot_poison", nombre: "DOT_poison", duracion: 5, tga: false });
    const fundidos = llegado.filter((p) => p.tipo === "fundido");
    assert.equal(fundidos.length, g.heridas.length, "uno por cada `xdodamage` que entra");
    assert.ok(fundidos.length >= 4, `${fundidos.length}`);
    assert.deepEqual(fundidos[0].mensaje, { duracion: 819, aguante: 0, banderas: 0, r: 75, g: 215, b: 0, a: 30 });
    assert.ok(llegado.some((p) => p.tipo === "brillo" && p.brillo.cantidad === 72));
  });

  // LECTURA VIEJA (pieza B): «EL PUENTE: el guion del efecto ya no apunta
  // `effect` ni `hud.addstatusicon`». El puente envolvía `ejecutarComando` de
  // cada instancia; la pieza G lo quitó y los comandos entran por su `case` en
  // `guion.js` y el gancho `comandoDePantalla` del entorno. La prueba vigila
  // ahora ese camino: que nadie haya tapado `ejecutarComando` en la instancia
  // (si vuelve un puente, esto se pone rojo) y que el efecto llegue igual.
  test("EL CAMINO: el efecto corre `effect`/`hud.*` por el `case` del intérprete, sin puente", () => {
    const { g, llegado, pasar } = montar();
    const ef = g.efectos.aplicar("effects/dot_poison", ["5.0", "0", "0.4"], RATA);
    pasar(2);
    const nombres = ef.guion.noSoportados.map((x) => x.nombre);
    assert.ok(!nombres.includes("effect") && !nombres.includes("hud.addstatusicon"), JSON.stringify(nombres));
    assert.equal(Object.hasOwn(ef.guion, "ejecutarComando"), false, "el guion del efecto no lleva un `ejecutarComando` propio");
    assert.equal(Object.hasOwn(g.guion, "ejecutarComando"), false, "ni el del jugador");
    assert.equal(typeof ef.guion.entorno.comandoDePantalla, "function", "el efecto hereda el gancho del anfitrión");
    assert.ok(llegado.some((p) => p.tipo === "icono"), "y le llega a la pantalla");
    assert.ok(g.pantallas.some((p) => p.de === ef.guion.nombre), `de quién: ${JSON.stringify(g.pantallas.map((p) => p.de))}`);
  });

  test("EL CASE, por texto: un guion suelto con el gancho lo recibe; sin gancho se apunta como `effect`", () => {
    const texto = "{ e\n effect screenfade ent_me 0.2 0 (75,215,0) 30 fadein\n hud.killicons ent_me\n}";
    const visto = [];
    const con = new Guion({ eventos: partirGuion(texto).eventos });
    con.entorno.comandoDePantalla = (n, ps, { desde }) => { visto.push([n, ps[0], desde === con]); return true; };
    con.llamar("e", []);
    assert.deepEqual(visto, [["effect", "screenfade", true], ["hud.killicons", "ent_me", true]]);
    assert.equal(con.noSoportados.length, 0, JSON.stringify(con.noSoportados));
    const sin = new Guion({ eventos: partirGuion(texto).eventos });
    sin.llamar("e", []);
    assert.deepEqual(sin.noSoportados.map((x) => x.nombre), ["effect", "hud.killicons"]);
  });

  test("CONTROL: lo que el gancho no porta lo apunta el intérprete (`effect beam`)", () => {
    const { g } = montar();
    g.llamar("beam_fx");
    assert.ok(g.guion.noSoportados.some((x) => x.nombre === "effect"), JSON.stringify(g.guion.noSoportados));
  });

  test("CONTROL NEGATIVO: sin puerta de pantalla no se traga: se apunta «(sin pantalla)» y se cuenta", () => {
    const { g, pasar } = montar({ pantalla: false });
    const ef = g.efectos.aplicar("effects/dot_poison", ["5.0", "0", "0.4"], RATA);
    pasar(3);
    assert.ok(ef.guion.noSoportados.some((x) => /sin pantalla/.test(x.nombre)), JSON.stringify(ef.guion.noSoportados));
    assert.ok(g.pantallas.some((p) => p.tipo === "icono"));
  });
});

// ── CON SERVIDOR, Y CON DOS JUGADORES ──────────────────────────────────────

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
    pantallas: () => dentro.filter((m) => m.t === MENSAJE.PANTALLA),
    textos: () => dentro.filter((m) => m.t === MENSAJE.TEXTO).map((m) => m.texto),
  };
}

/** La partida del 92 (test/costurared92b.test.mjs): una rata del mod a −1,2 m. */
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
  const pasar = (segundos) => { for (let k = 0; k < Math.round(segundos * 100); k++) partida._paso(); };
  const pegar = (q) => partida.recibir(q.c.id, {
    t: MENSAJE.PEGAR, id: rata.id, dano: 1, alcance: 60, cubo: "swordsmanship.0", tipo: "slash",
  });
  return { partida, quienes, pasar, pegar };
}

describe("con servidor: el veneno de la rata pinta la pantalla de quien lo lleva, y sólo de él", { skip: !HAY_MOD || !HAY_EFECTOS }, () => {
  const VENENO = { [RATA]: ["add_dot_poison"] };

  test("Ana le pega, la rata la envenena: a Ana le llegan el icono y los fundidos; a Beto, nada", async () => {
    const { partida, quienes, pasar, pegar } = await partidaConRata({ params: VENENO });
    const [ana, beto] = quienes;
    pasar(0.1);
    await pegar(ana);
    pasar(12);
    assert.ok(ana.b.textos().includes("You have been poisoned!"), "control: el veneno ha caído en Ana");
    const suyas = ana.b.pantallas();
    const icono = suyas.find((m) => m.que === "icono" && m.tipo === 1);
    assert.ok(icono, JSON.stringify(suyas));
    assert.equal(icono.nombre, "DOT_poison");
    assert.equal(icono.icono, "hud/status/alpha_dot_poison");
    assert.ok(icono.duracion > 0);
    const fundidos = suyas.filter((m) => m.que === "fundido");
    assert.ok(fundidos.length >= 1, `fundidos: ${fundidos.length}`);
    assert.deepEqual({ ...fundidos[0], t: undefined, v: undefined, que: undefined },
      { t: undefined, v: undefined, que: undefined, duracion: 819, aguante: 0, banderas: 0, r: 75, g: 215, b: 0, a: 30 });
    assert.equal(beto.b.pantallas().length, 0, `a Beto no le llega nada: ${JSON.stringify(beto.b.pantallas())}`);
    // Y el brillo se cuenta y NO viaja: lo verían los demás sobre su modelo,
    // que este puerto aún no dibuja.
    const ef = partida.costura().efectos.find((e) => e.cliente === ana.c.id);
    assert.ok(ef.pantallas.brillo >= 1, JSON.stringify(ef.pantallas));
    assert.equal(ef.pantallas.icono, suyas.filter((m) => m.que === "icono").length);
    assert.ok(!suyas.some((m) => m.que === "brillo"));
  });

  test("CONTROL NEGATIVO: la misma rata sin `add_dot_poison` muerde y no manda nada a la pantalla", async () => {
    const { partida, quienes, pasar, pegar } = await partidaConRata();
    pasar(0.1);
    await pegar(quienes[0]);
    pasar(12);
    assert.ok(partida.costura().bichos[0].recibidos.game_dodamage >= 1, "control: ha mordido");
    assert.equal(quienes[0].b.pantallas().length, 0);
  });
});
