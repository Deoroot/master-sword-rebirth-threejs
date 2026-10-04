// EL 101 — EL GRITO DEL PHOENIX BOW Y LO QUE SE VE CUANDO SU FLECHA REVIENTA.
//
// El daño de la explosión es del 97 (`test/proyectiles97.test.mjs`). Aquí va lo
// que faltaba: lo que SUENA al soltar y al reventar, y el efecto de cliente.
//
// Por donde entra el juego (CLAUDE.md §4, el 59 y el 67):
//
//   - el LECTOR recibe el guion del juego tal cual está en `../MSC/`, y un
//     guion de mentira en una carpeta temporal para los casos que el juego no
//     trae; nunca un objeto escrito a mano;
//   - la COSTURA se prueba con `montarArco` de verdad sobre un mundo de mentira
//     y las fichas HORNEADAS (`build/msr/armas.json`), disparando por `tirar` y
//     volando por `pasoDeFlechas`, que es lo que llama el bucle. El audio y el
//     estallido son dos testigos que apuntan lo que el arco les pide;
//   - los números de la regla van escritos A MANO con su cita, no leídos de la
//     constante que miden (el 75).

import test, { describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { leerFichaObjeto, sonidosAlSalir } from "../src/bsp/script.js";
import { montarArco } from "../src/juego/arco.js";
import { ESTALLIDOS, ESTALLIDO_DEL_FENIX, estallidoDelFenix, opacidadDelEstallido } from "../src/play/fenix.js";

const RAIZ_REPO = fileURLToPath(new URL("..", import.meta.url));
const SCRIPTS = join(RAIZ_REPO, "../MSC/MSCScripts/scripts");
const ARMAS = join(RAIZ_REPO, "build/msr/armas.json");
const SND = join(RAIZ_REPO, "build/msr/snd");
const sinScripts = !existsSync(`${SCRIPTS}/items/proj_arrow_phx.script`) && "sin ../MSC/MSCScripts";
const cat = existsSync(ARMAS) ? JSON.parse(readFileSync(ARMAS, "utf8")) : null;
// El horneado del 101 trae `estallidos` y `sonidos.alSalir` en las flechas.
const sinArmas = !(cat?.estallidos && cat.flechas?.[0]?.sonidos && "alSalir" in cat.flechas[0].sonidos)
  && "sin build/msr/armas.json del 101 (npm run armas)";
const cerca = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── 1. EL LECTOR ───────────────────────────────────────────────────────────

describe("lo que suena al salir un proyectil (`game_tossprojectile`)", () => {
  test("la flecha del Fénix grita: `svplaysound 0 5 SOUND_PHOENIX` → hawkcaw, canal 0, volumen 0,5", { skip: sinScripts }, () => {
    const f = leerFichaObjeto(SCRIPTS, "items/proj_arrow_phx");
    // proj_arrow_phx.script:33 y :54-57; el volumen es `atof / 10` (scriptcmds.cpp:4706-4712).
    assert.deepEqual(f.sonidos.alSalir, [
      { canal: 0, volumen: 0.5, archivo: "monsters/birds/hawkcaw.wav", deServidor: true },
    ]);
  });

  test("el segundo caso: la flecha de madera, la gratis y la saeta NO tocan nada al salir", { skip: sinScripts }, () => {
    for (const id of ["proj_arrow_wooden", "proj_arrow_generic", "proj_bolt_generic", "proj_arrow_fire"]) {
      assert.deepEqual(leerFichaObjeto(SCRIPTS, `items/${id}`).sonidos.alSalir, [], id);
    }
  });

  test("el arco suelta con `SOUND_SHOOT`: la cuerda en el arco, y la BALLESTA con la suya", { skip: sinScripts }, () => {
    // bows_firebird.script:12 y bows_crossbow_light.script:14.
    assert.equal(leerFichaObjeto(SCRIPTS, "items/bows_firebird").sonidos.disparo, "weapons/bow/bow.wav");
    assert.equal(leerFichaObjeto(SCRIPTS, "items/bows_crossbow_light").sonidos.disparo, "weapons/bow/crossbow.wav");
    // Y `blandir` (`SOUND_SWIPE`) sigue vacío en un arco: no son el mismo campo.
    assert.equal(leerFichaObjeto(SCRIPTS, "items/bows_firebird").sonidos.blandir, null);
  });

  test("el lector, con texto: resuelve la constante, divide el volumen entre 10 y lo recorta a 1", () => {
    const consts = new Map([["SND", "magic/cast.wav"]]);
    const r = sonidosAlSalir(["setmodelbody 0 3", "playsound 2 25 SND", "svplaysound 1 3 ambience/alienflyby1.wav"], (t) => consts.get(t) ?? null);
    assert.deepEqual(r.sonidos, [
      { canal: 2, volumen: 1, archivo: "magic/cast.wav", deServidor: false },
      { canal: 1, volumen: 0.3, archivo: "ambience/alienflyby1.wav", deServidor: true },
    ]);
    assert.equal(r.sinLeer, false);
  });

  test("y se PARA en el primer `if`: lo de después no se inventa, se declara sin leer", () => {
    const r = sonidosAlSalir(["if !CLFX_ARROW", "svplaysound 0 5 x/y.wav"], () => null);
    assert.deepEqual(r.sonidos, []);
    assert.equal(r.sinLeer, true);
    // `none` es un valor y no una ruta, y una constante sin definir no es un archivo.
    assert.deepEqual(sonidosAlSalir(["playsound 0 5 none", "playsound 0 5 SOUND_QUE_NO_HAY"], () => null).sonidos, []);
  });
});

// ── 2. LA REGLA DEL ESTALLIDO ──────────────────────────────────────────────

describe("el efecto de cliente de la flecha del Fénix (proj_arrow_phx_cl.script)", () => {
  test("a radio 256 (el máximo): escala 10, sube 30 u, luz de 384 u", () => {
    // `$ratio(1, 1.0, 10.0)` = 10 (:26); `$ratio(1, 8.0, 30.0)` = 30 (:31); 256 × 1,5 (:44-45).
    const e = estallidoDelFenix({ centro: [100, 20, -50], radio: 256 });
    assert.ok(cerca(e.escala, 10));
    assert.ok(cerca(e.alza, 30));
    assert.deepEqual(e.llamarada, [100, 50, -50]);
    assert.ok(cerca(e.luz.radio, 384));
    assert.deepEqual(e.luz.color, [255, 128, 64]);
    assert.equal(e.luz.vida, 2.0);
    // La luz y el sonido van en `FX_CENTER`, SIN subir (:46, :49).
    assert.deepEqual(e.luz.donde, [100, 20, -50]);
    assert.deepEqual(e.sonido, { donde: [100, 20, -50], archivo: "ambience/steamburst1.wav", volumen: 0.5 });
  });

  test("a radio 32 (a quemarropa): escala 2,125 y sube 10,75 u — no es la de 256", () => {
    // r = 32/256 = 0,125 → 1 + 9·0,125 y 8 + 22·0,125.
    const e = estallidoDelFenix({ centro: [0, 0, 0], radio: 32 });
    assert.ok(cerca(e.escala, 2.125));
    assert.ok(cerca(e.alza, 10.75));
    assert.ok(cerca(e.luz.radio, 48));
  });

  test("al torpe (radio × 0,5, proj_arrow_phx.script:93) le sale más pequeña: 16 u → 1,5625", () => {
    assert.ok(cerca(estallidoDelFenix({ radio: 16 }).escala, 1.5625));
  });

  test("se desvanece en línea recta en sus 2 s: 1 al nacer, 0,5 al segundo, 0 a los dos", () => {
    // `renderamt = 255 · (1 − transcurrido/duración)` (client/entity.cpp:2084-2088).
    assert.equal(opacidadDelEstallido(0), 1);
    assert.ok(cerca(opacidadDelEstallido(1), 0.5));
    assert.ok(cerca(opacidadDelEstallido(1.5), 0.25));
    assert.equal(opacidadDelEstallido(2), 0);
    assert.equal(opacidadDelEstallido(5), 0);
  });

  test("la ficha: submodelo 51, secuencia 8, aditivo, guiño de 90", () => {
    // proj_arrow_phx_cl.script:70, :72, :73, :81.
    assert.equal(ESTALLIDO_DEL_FENIX.submodelo, 51);
    assert.equal(ESTALLIDO_DEL_FENIX.secuencia, 8);
    assert.equal(ESTALLIDO_DEL_FENIX.aditivo, true);
    assert.equal(ESTALLIDO_DEL_FENIX.guino, 90);
    assert.equal(ESTALLIDO_DEL_FENIX.modelo, "weapons/projectiles.mdl");
  });
});

// ── 3. EL HORNEADO ─────────────────────────────────────────────────────────

describe("lo que llega a `build/`", () => {
  test("el estallido es el submodelo «fire_burst» con la secuencia «spin_horizontal_fast»", { skip: sinArmas }, () => {
    const e = cat.estallidos.find((x) => x.id === "proj_arrow_phx");
    assert.ok(e?.clave, "trae su carpeta");
    // El oráculo del nombre: el 51 de `projectiles.mdl` es una llamarada. Si
    // sale una flecha o un aura, el número está mal.
    assert.equal(e.pieza, "fire_burst");
    assert.equal(e.nombreDeSecuencia, "spin_horizontal_fast");
    assert.ok(e.secuencias.includes("spin_horizontal_fast"));
    assert.ok(existsSync(join(RAIZ_REPO, "build/msr/armas", e.clave, "bicho.json")), "y la carpeta existe");
  });

  test("la flecha horneada trae el grito, y sólo ella entre todo lo que se tira", { skip: sinArmas }, () => {
    const conGrito = cat.flechas.filter((f) => (f.sonidos?.alSalir ?? []).length).map((f) => f.id);
    assert.deepEqual(conGrito, ["proj_arrow_phx"]);
  });

  test("TODO lo que nombra una flecha o un arco para sonar está en `build/msr/snd` (npm run sonido)",
    { skip: sinArmas || (!existsSync(join(SND, "weapons")) && "sin build/msr/snd (npm run sonido)") }, () => {
      // El hueco que tapaba esto: `weapons/bow/` no se horneaba ENTERA, así que
      // ningún arco sonaba al soltar ni ninguna flecha al clavarse.
      const pedidos = new Set();
      for (const a of cat.armas) if (a.sonidos?.disparo) pedidos.add(a.sonidos.disparo);
      for (const f of cat.flechas) {
        for (const s of f.sonidos?.contraPared ?? []) pedidos.add(s);
        for (const s of f.sonidos?.alSalir ?? []) pedidos.add(s.archivo);
      }
      for (const e of cat.estallidos) pedidos.add(e.sonido);
      for (const obligado of ["weapons/bow/bow.wav", "weapons/bow/crossbow.wav", "weapons/bow/arrowhit1.wav",
        "monsters/birds/hawkcaw.wav", "ambience/steamburst1.wav"]) {
        assert.ok(pedidos.has(obligado), `${obligado} lo nombra alguien`);
        assert.ok(existsSync(join(SND, obligado)), `${obligado} está horneado`);
      }
      // Lo que falte del resto se dice, no se exige: hay `SOUND_SHOOT` de
      // Half-Life que sólo están con `valve/` al lado.
      const faltan = [...pedidos].filter((s) => s !== "none" && !existsSync(join(SND, s)));
      assert.ok(faltan.length <= 3, `faltan ${faltan.length}: ${faltan.join(", ")}`);
    });
});

// ── 4. LA COSTURA: el arco de verdad sobre un mundo de mentira ─────────────
//
// Un plano vertical a `z = -paredZ` metros y un suelo en `y = 0`, como el de
// `test/proyectiles97.test.mjs`.

const U = 39.37;
class Rayo { constructor(o, d) { this.o = o; this.d = d; } }
function mundo({ paredZ = 5 } = {}) {
  return {
    castRay(r, L) {
      const { o, d } = r;
      if (d.y < -0.9) { const t = o.y / -d.y; return t <= L ? { timeOfImpact: t, collider: { handle: 99 } } : null; }
      if (!(d.z < -1e-6)) return null;
      const t = (o.z + paredZ) / -d.z;
      if (t < 0 || t > L) return null;
      return { timeOfImpact: t, collider: { handle: 98 } };
    },
  };
}
function arcoDePrueba({ arma, paredZ = 5, despierto = true, conEstallido = true, arqueria = 60 }) {
  const flechas = new Map(cat.flechas.map((f) => [f.id, f]));
  const ficha = cat.armas.find((a) => a.id === arma);
  const ataques = ficha.ataques.filter((a) => a.tipo);
  const sonados = [];
  const lanzados = [];
  const prop = { proficiency: { valor: arqueria }, balance: { valor: arqueria }, power: { valor: arqueria } };
  const a = montarArco({
    RAPIER: { Ray: Rayo }, world: () => mundo({ paredZ }),
    player: () => ({ pitch: 0, yaw: 0, eye: [0, 1.6, 0], feet: [0, 0, 0], perfil: { height: 72 / U }, body: {} }),
    U: () => U,
    sesion: () => ({ personaje: { habilidades: { archery: prop }, objetos: [] } }),
    audio: () => ({ despierto, unaVez: (archivo, o = {}) => { sonados.push({ archivo, ...o }); } }),
    bichos: () => ({ herir: () => ({ muerto: false }) }),
    bichosSolidos: () => ({ puestos: [] }),
    // La ficha HORNEADA entera, que es lo que lleva `Brazo.arma` en el juego.
    brazo: () => ({ arma: ficha, ataques, esDeTiro: true }),
    catalogoDeFlechas: () => flechas,
    potenciaDe: () => 50, destrezaDe: () => 0,
    candidatosVivos: () => [], trazaDelMundo: () => true,
  });
  if (conEstallido) {
    for (const id of a.estallidosQueTira({ ataques })) {
      a.ponerEstallido(id, { lanzar: (e) => lanzados.push(e), paso() {}, hayVivos: false });
    }
  }
  const tiro = ataques.find((t) => t.tipo === "charge-throw-projectile");
  return { a, tiro, sonados, lanzados, ataques };
}
const volar = (a, f) => { for (let k = 0; k < 600 && f.volando; k++) a.pasoDeFlechas(1 / 60); };

describe("COSTURA: el Phoenix Bow por `tirar` y `pasoDeFlechas`", { skip: sinArmas }, () => {
  test("AL SOLTAR suenan la cuerda y EL GRITO, el grito a volumen 0,5 y en el sitio de donde sale", () => {
    const { a, tiro, sonados } = arcoDePrueba({ arma: "bows_firebird", paredZ: 8 });
    const f = a.tirar(tiro, 1.3);
    assert.equal(f.ficha.id, "proj_arrow_phx");
    // En el MISMO `tirar`, sin un paso de vuelo: `game_tossprojectile` corre
    // dentro de `TossProjectile` (giprojectile.cpp:114-116).
    assert.deepEqual(sonados.map((s) => s.archivo), ["snd/weapons/bow/bow.wav", "snd/monsters/birds/hawkcaw.wav"]);
    assert.equal(sonados[0].volumen, 1);
    assert.equal(sonados[1].volumen, 0.5);
    // `reg.attack.ofs.startpos (0,0,10)` (bows_firebird.script:49): diez
    // unidades por encima del ojo, que está a 1,6 m — en METROS, que es en lo
    // que escucha el audio (el 81: las unidades se cruzan una vez y a sabiendas).
    // Con un centímetro de holgura: el «arriba» de esas diez unidades es el de la
    // flecha, que sale con el grado de cono del arco (`COF 1;1`, :44) y es un dado.
    assert.ok(cerca(sonados[1].donde[0], 0, 0.01) && cerca(sonados[1].donde[2], 0, 0.01), JSON.stringify(sonados[1].donde));
    assert.ok(cerca(sonados[1].donde[1], 1.6 + 10 / U, 0.01), `${sonados[1].donde[1]}`);
    // Y NO en unidades: 1,85 m no son 73 u (el 81).
    assert.ok(sonados[1].donde[1] < 3, `${sonados[1].donde[1]}`);
  });

  test("AL REVENTAR: la llamarada con la escala del RADIO del daño, y el vapor en el suelo", () => {
    const { a, tiro, sonados, lanzados } = arcoDePrueba({ arma: "bows_firebird", paredZ: 8 });
    const f = a.tirar(tiro, 1.3);
    assert.equal(lanzados.length, 0, "aún vuela");
    volar(a, f);
    assert.equal(f.volando, false);
    const ex = a.deGuion.explosiones.at(-1);
    assert.ok(ex.radio > 32 && ex.radio < 256, `radio ${ex.radio}`);
    assert.equal(lanzados.length, 1, "UNA llamarada");
    // La escala sale del radio de ESTA explosión: 1 + 9·radio/256 (:24-26).
    assert.ok(cerca(lanzados[0].escala, 1 + 9 * ex.radio / 256, 1e-9), `${lanzados[0].escala}`);
    assert.ok(cerca(lanzados[0].luz.radio, ex.radio * 1.5, 1e-9));
    // En el suelo (`$get_ground_height`, proj_arrow_phx.script:64) y subida `Z_ADJ`.
    assert.ok(cerca(ex.centro[1], 0, 1e-6), `centro ${ex.centro}`);
    assert.ok(cerca(lanzados[0].llamarada[1], 8 + 22 * ex.radio / 256, 1e-6));
    assert.equal(ex.efecto.dibujado, true);
    // Y suenan el flechazo de `proj_arrow_base` y el vapor, éste en el centro y en metros.
    const vapor = sonados.find((s) => s.archivo === "snd/ambience/steamburst1.wav");
    assert.ok(vapor, sonados.map((s) => s.archivo).join(", "));
    assert.equal(vapor.volumen, 0.5);
    assert.ok(cerca(vapor.donde[2], ex.centro[2] / U, 1e-6) && cerca(vapor.donde[1], 0, 1e-6), JSON.stringify(vapor.donde));
    assert.ok(sonados.some((s) => /^snd\/weapons\/bow\/arrowhit[12]\.wav$/.test(s.archivo)), "y el flechazo");
  });

  test("más lejos, MÁS GRANDE: la pared a 20 m da una llamarada mayor que a 3 m", () => {
    const cerquita = arcoDePrueba({ arma: "bows_firebird", paredZ: 3 });
    const lejos = arcoDePrueba({ arma: "bows_firebird", paredZ: 20 });
    for (const x of [cerquita, lejos]) volar(x.a, x.a.tirar(x.tiro, 1.3));
    assert.equal(cerquita.lanzados.length, 1);
    assert.equal(lejos.lanzados.length, 1);
    assert.ok(lejos.lanzados[0].escala > cerquita.lanzados[0].escala + 1,
      `${cerquita.lanzados[0].escala} → ${lejos.lanzados[0].escala}`);
  });

  test("al torpe (arquería < 25) le revienta a la mitad de radio, y la llamarada lo dice", () => {
    const bueno = arcoDePrueba({ arma: "bows_firebird", paredZ: 8, arqueria: 60 });
    const torpe = arcoDePrueba({ arma: "bows_firebird", paredZ: 8, arqueria: 10 });
    for (const x of [bueno, torpe]) volar(x.a, x.a.tirar(x.tiro, 1.3));
    const rb = bueno.a.deGuion.explosiones.at(-1).radio, rt = torpe.a.deGuion.explosiones.at(-1).radio;
    // Media unidad de holgura: son dos tiros y cada uno lleva su dado de cono.
    assert.ok(cerca(rt, rb * 0.5, 0.5), `${rb} → ${rt}`);
    assert.ok(torpe.lanzados[0].escala < bueno.lanzados[0].escala);
  });

  test("sin conjunto montado el daño sigue y la explosión se CUENTA como no dibujada", () => {
    const { a, tiro, lanzados, sonados } = arcoDePrueba({ arma: "bows_firebird", paredZ: 8, conEstallido: false });
    volar(a, a.tirar(tiro, 1.3));
    assert.equal(lanzados.length, 0);
    assert.equal(a.deGuion.sinEstallido, 1);
    assert.equal(a.deGuion.explosiones.at(-1).efecto.dibujado, false);
    // El sonido no espera al dibujo: son dos órdenes distintas del guion.
    assert.ok(sonados.some((s) => s.archivo === "snd/ambience/steamburst1.wav"));
  });

  test("con el audio DORMIDO no suena nada, y queda dicho que se pidió", () => {
    const { a, tiro, sonados } = arcoDePrueba({ arma: "bows_firebird", paredZ: 8, despierto: false });
    volar(a, a.tirar(tiro, 1.3));
    assert.equal(sonados.length, 0);
    const pedidos = a.deGuion.sonidos;
    assert.deepEqual(pedidos.filter((s) => s.porQue !== "disparo").map((s) => [s.porQue, s.archivo, s.despierto]), [
      ["alSalir", "monsters/birds/hawkcaw.wav", false],
      ["estallido", "ambience/steamburst1.wav", false],
    ]);
  });
});

describe("COSTURA, EL SEGUNDO CASO: los arcos que NO son el Fénix", { skip: sinArmas }, () => {
  test("el arco de árbol suena a cuerda, NO grita y NO revienta", () => {
    const { a, tiro, sonados, lanzados } = arcoDePrueba({ arma: "bows_treebow", paredZ: 8 });
    const f = a.tirar(tiro, 1.3);
    assert.equal(f.ficha.id, "proj_arrow_generic");
    assert.deepEqual(sonados.map((s) => s.archivo), ["snd/weapons/bow/bow.wav"]);
    volar(a, f);
    assert.equal(lanzados.length, 0);
    assert.equal(a.deGuion.explosiones.length, 0);
    assert.equal(a.deGuion.sinEstallido, 0);
    assert.ok(!sonados.some((s) => /hawkcaw|steamburst/.test(s.archivo)), sonados.map((s) => s.archivo).join(", "));
  });

  test("qué estallidos se montan: el Fénix por NOMBRE, un arco cualquiera por TEXTO, una ballesta ninguno", () => {
    const de = (arma) => { const x = arcoDePrueba({ arma, conEstallido: false }); return x.a.estallidosQueTira({ ataques: x.ataques }); };
    assert.deepEqual(de("bows_firebird"), ["proj_arrow_phx"]);
    // `msstring(sProjectileType).contains("arrow")` (giattack.cpp, ver `municion`):
    // un arco tira cualquier `proj_arrow_*` que lleves, la del Fénix incluida,
    // así que su estallido se monta también — igual que `clavesQueTira`.
    assert.deepEqual(de("bows_treebow"), ["proj_arrow_phx"]);
    // Y el caso que da OTRA respuesta: una ballesta tira `bolt`.
    assert.deepEqual(de("bows_crossbow_light"), []);
  });

  test("la ballesta suena a BALLESTA y no a arco (`weapons/bow/crossbow.wav`)", () => {
    const { a, tiro, sonados } = arcoDePrueba({ arma: "bows_crossbow_light", paredZ: 8 });
    a.tirar(tiro, 0.1);
    assert.equal(sonados[0].archivo, "snd/weapons/bow/crossbow.wav");
    assert.ok(!sonados.some((s) => s.archivo === "snd/weapons/bow/bow.wav"));
  });

  test("los arcos y ballestas del catálogo traen su disparo, todos menos la de vapor", () => {
    const deTiro = cat.armas.filter((x) => /^bows_/.test(x.id) && x.ataques.some((t) => t.tipo === "charge-throw-projectile"));
    assert.ok(deTiro.length >= 14, `${deTiro.length}`);
    const sin = deTiro.filter((x) => !x.sonidos?.disparo).map((x) => x.id);
    // La de vapor no declara `SOUND_SHOOT`: dispara por su propio
    // `game_attack1_down` y toca `weapons/bow/steam.wav` a mano
    // (bows_sxbow.script:219), un camino que este puerto no tiene. Suena a arco
    // por el valor de reposo de `tirar`, y eso queda dicho aquí por su nombre.
    assert.deepEqual(sin, ["bows_sxbow"]);
    // Y hay DOS sonidos distintos entre ellos: si todos dieran el mismo, el
    // valor de reposo y el correcto serían la misma cadena (el 50).
    assert.ok(new Set(deTiro.map((x) => x.sonidos.disparo)).size >= 2);
  });
});

// ── 5. LO QUE QUEDA SIN PORTAR, CONTADO ────────────────────────────────────

test("de lo que se puede tirar aquí, cuántos llaman a un guion de cliente y cuántos se dibujan", { skip: sinArmas || sinScripts }, (t) => {
  const conCliente = [];
  for (const f of cat.flechas) {
    const ruta = join(SCRIPTS, "items", `${f.id}.script`);
    if (!existsSync(ruta)) continue;
    const propio = readFileSync(ruta, "latin1").split(/\r?\n/)
      .filter((l) => /^\s*clientevent\s+new\b/.test(l));
    if (propio.length) conCliente.push(f.id);
  }
  const dibujados = conCliente.filter((id) => ESTALLIDOS[id]);
  t.diagnostic(`con \`clientevent new\` propio: ${conCliente.length} (${conCliente.join(", ")}); dibujados: ${dibujados.join(", ")}`);
  assert.ok(conCliente.includes("proj_arrow_phx"));
  assert.deepEqual(dibujados, ["proj_arrow_phx"]);
  // Todo estallido declarado es de algo que de verdad se puede tirar (el 62).
  for (const id of Object.keys(ESTALLIDOS)) assert.ok(cat.flechas.some((f) => f.id === id), id);
});

// ── Una carpeta `items/` de mentira, para el caso que el juego no trae ─────
const TMP = mkdtempSync(join(tmpdir(), "fenix101-"));
mkdirSync(join(TMP, "items"));
after(() => rmSync(TMP, { recursive: true, force: true }));

test("un `[override]` de `game_tossprojectile` calla el grito del padre", () => {
  writeFileSync(join(TMP, "items", "padre.script"),
    "{\n\tconst SND a/b.wav\n}\n{ game_tossprojectile\n\tsvplaysound 0 7 SND\n}\n", "latin1");
  writeFileSync(join(TMP, "items", "hijo.script"),
    "#include items/padre\n{ [override] game_tossprojectile\n\tsetmodelbody 0 1\n}\n", "latin1");
  writeFileSync(join(TMP, "items", "otro.script"),
    "#include items/padre\n{ game_tossprojectile\n\tplaysound 1 2 c/d.wav\n}\n", "latin1");
  assert.deepEqual(leerFichaObjeto(TMP, "items/padre").sonidos.alSalir.map((s) => [s.archivo, s.volumen]), [["a/b.wav", 0.7]]);
  assert.deepEqual(leerFichaObjeto(TMP, "items/hijo").sonidos.alSalir, []);
  // Sin `[override]` corren LOS DOS, que el motor ejecuta todos los que se llamen igual.
  assert.deepEqual(leerFichaObjeto(TMP, "items/otro").sonidos.alSalir.map((s) => s.archivo).sort(), ["a/b.wav", "c/d.wav"]);
});
