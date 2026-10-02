// SOLTAR DEL INVENTARIO — las pruebas del 75.
//
// La regla está en `src/play/suelo.js`, con sus citas. Aquí se mide, y el orden
// es el del motor: el tercio del cabeceo, el empuje, el suelo que no es suelo,
// los dos candados muertos y la tautología.
//
// Lo que NO se prueba aquí porque no es de esta capa: que el nodo de Three se
// mueva, que la tecla `c` llegue y que la tapa de la cloaca de Edana sea una
// `func_door`. Eso es `sondas/edana75.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Suelo, ObjetoSuelto, aMano, angulosDeSoltar, rumboDeSoltar, puedeSoltar,
  EMPUJE, ALZADO, ADELANTE, TERCIO, CADUCA, GRAVEDAD,
} from "../src/play/suelo.js";
import { leerFichaObjeto } from "../src/bsp/script.js";

const SCRIPTS = "../MSC/MSCScripts/scripts";
const CATALOGO = new Map([
  ["swords_rsword", { id: "swords_rsword", nombre: "Rusty Short Sword" }],
  ["health_apple", { id: "health_apple", nombre: "Apple" }],
]);
const suelo = () => new Suelo({ catalogo: CATALOGO, azar: () => 0.5 });

// El rumbo de la vista en ejes de escena para un cabeceo en grados: mirando al
// frente con `grados` por debajo de la horizontal.
const mirarAbajo = (grados) => {
  const r = (grados * Math.PI) / 180;
  return [0, -Math.sin(r), -Math.cos(r)];
};

// ── 1. EL TERCIO ────────────────────────────────────────────────────────────
//
// `sv_player->v.angles[0] = -pmove->angles[0] / 3.0` (sv_user.cpp:993), y de ahí
// sale el `v_forward` de `DropItem`. Es el hallazgo del experimento y la prueba
// tiene que poner los números donde la diferencia existe: a cabeceo cero las
// tres variantes —la vista, el tercio y el tercio con el signo— dan lo mismo.

test("mirando al frente, soltar va al frente", () => {
  const f = rumboDeSoltar([0, 0, -1]);
  assert.ok(Math.abs(f[1]) < 1e-9, `la componente vertical debería ser 0 y es ${f[1]}`);
  assert.ok(f[2] < -0.99);
});

test("mirando 60 grados AL SUELO, el objeto sale 20 grados HACIA ARRIBA", () => {
  const [cabeceo] = angulosDeSoltar(mirarAbajo(60));
  // `angles[0]` del motor: positivo es nariz abajo, así que −20 es 20 arriba.
  assert.ok(Math.abs(cabeceo - -20) < 1e-6, `cabeceo ${cabeceo}`);
  const f = rumboDeSoltar(mirarAbajo(60));
  assert.ok(f[1] > 0, `la vertical del empuje debería ser POSITIVA y es ${f[1]}`);
  assert.ok(Math.abs(f[1] - Math.sin((20 * Math.PI) / 180)) < 1e-6);
});

test("mirando 30 al cielo, sale 10 al cielo: un tercio, no la vista", () => {
  const [cabeceo] = angulosDeSoltar(mirarAbajo(-30));
  assert.ok(Math.abs(cabeceo - 10) < 1e-6, `cabeceo ${cabeceo}`);
});

test("el divisor es 3 y no 1: un tercio de la vista, no la vista", () => {
  // El control que distingue «he puesto el signo» de «he puesto el tercio». Con
  // TERCIO a 1 esta cuenta da 60 y la prueba se pone roja.
  const [cabeceo] = angulosDeSoltar(mirarAbajo(60));
  assert.equal(TERCIO, 3);
  assert.ok(Math.abs(Math.abs(cabeceo) - 60 / TERCIO) < 1e-6);
});

test("el rumbo horizontal NO se divide: sólo el cabeceo", () => {
  // Mirando a la derecha del eje −Z, 90 grados. El rumbo del motor tiene que
  // salir entero; si alguien dividiera los dos ángulos, saldría 30.
  const [, rumbo] = angulosDeSoltar([1, 0, 0]);
  assert.ok(Math.abs(rumbo - 0) < 1e-6, `rumbo ${rumbo}`);
  const [, rumbo2] = angulosDeSoltar([0, 0, -1]);
  assert.ok(Math.abs(rumbo2 - 90) < 1e-6, `rumbo ${rumbo2}`);
});

test("lo más abajo que se puede tirar algo es 30 grados sobre la vista", () => {
  // Con la vista a 90 (justo al suelo) el objeto sale a 30 sobre la horizontal.
  // O sea que no hay manera de dejar algo a los pies, y eso es el juego.
  const f = rumboDeSoltar([0, -1, 0]);
  const subida = (Math.asin(f[1]) * 180) / Math.PI;
  assert.ok(Math.abs(subida - 30) < 1e-6, `sube ${subida} grados`);
});

// ── 2. EL EMPUJE, y que se lleva la velocidad del jugador ───────────────────

// Los tres números van escritos A MANO y no contra la constante, y eso es el
// apartado 4 de CLAUDE.md en vivo: la primera versión de estas dos pruebas
// comparaba `o.pos[2]` con `-ADELANTE`, así que al romper la constante se
// rompían los dos lados y **`ADELANTE = 0` se quedó verde**. Medía que la
// constante se usa, no que vale lo que dice el motor.
//
//     pev->origin   = EyePosition() + v_forward * 10          :1336
//     pev->velocity = ... + v_forward * 175 + Vector(0,0,60)  playershared.cpp:977

test("sale del ojo, DIEZ unidades adelante", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1] });
  assert.ok(o);
  assert.ok(Math.abs(o.pos[0] - 0) < 1e-6);
  assert.ok(Math.abs(o.pos[1] - 60) < 1e-6);
  assert.ok(Math.abs(o.pos[2] - -10) < 1e-6, `z ${o.pos[2]}`);
  assert.equal(ADELANTE, 10);
});

test("175 adelante y 60 arriba", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1] });
  assert.ok(Math.abs(o.vel[2] - -175) < 1e-6, `z ${o.vel[2]}`);
  assert.ok(Math.abs(o.vel[1] - 60) < 1e-6, `y ${o.vel[1]}`);
  assert.equal(EMPUJE, 175);
  assert.equal(ALZADO, 60);
});

test("se lleva la velocidad del jugador: soltar corriendo lo manda más lejos", () => {
  const s = suelo();
  const quieto = s.tirar({ guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1] });
  const corriendo = s.tirar({
    guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1],
    velocidad: [0, 0, -200],
  });
  assert.ok(corriendo.vel[2] < quieto.vel[2] - 150, `${corriendo.vel[2]} vs ${quieto.vel[2]}`);
});

test("lo soltado NO espera los 0,1 segundos del aparecedor", () => {
  // `Drop` llama a `FallInit` en el acto (genericitem.cpp:1357); un
  // `msitem_spawn` llega por `Fall()` a los 0,1 s. La diferencia se mide con el
  // mismo paso en los dos.
  const s = suelo();
  const tirado = s.tirar({ guion: "swords_rsword", ojo: [0, 1000, 0], mirando: [0, 0, -1] });
  const nacido = s.soltar({ guion: "health_apple", donde: [500, 1000, 0] });
  s.paso(1 / 60, { traza: () => null });
  assert.equal(tirado.estado, "cayendo");
  assert.equal(nacido.estado, "naciendo");
});

test("y lo tirado describe una parábola: sube antes de bajar", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 1000, 0], mirando: [0, 0, -1] });
  const y0 = o.pos[1];
  s.paso(1 / 60, { traza: () => null });
  assert.ok(o.pos[1] > y0, `debería subir y ha pasado de ${y0} a ${o.pos[1]}`);
  // 60 de velocidad contra 800 de gravedad: 0,075 s de subida.
  for (let i = 0; i < 40; i++) s.paso(1 / 60, { traza: () => null });
  assert.ok(o.pos[1] < y0, "y luego bajar");
  assert.ok(o.pos[2] < -100, `y haber avanzado, y lleva ${o.pos[2]}`);
});

test("la gravedad es la del proyecto y la caída la misma del 71", () => {
  assert.equal(GRAVEDAD, 800);
});

// ── 3. EL SUELO QUE NO ES SUELO ─────────────────────────────────────────────
//
// `FallThink` sólo hace lo suyo con `FL_ONGROUND`, y a un objeto de tamaño punto
// se lo da `SV_PointContents` del hull del MUNDO (sv_phys.cpp:1081-1109 contra
// world.cpp:625-626). Encima de una `func_door` no hay suelo.

test("contra el mundo: se tumba, suena y vuelve a poner el reloj", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 100, 0], mirando: mirarAbajo(80) });
  assert.ok(o.angulos[0] !== 0, "sale inclinado");
  for (let i = 0; i < 200 && (o.estado === "naciendo" || o.estado === "cayendo"); i++) {
    s.paso(1 / 60, { traza: (a, b) => (b[1] < 0 ? { punto: [b[0], 0, b[2]], deEntidad: false } : null) });
  }
  assert.equal(o.estado, "suelo");
  assert.equal(o.angulos[0], 0, "se tumba: el cabeceo a cero");
  assert.equal(o.angulos[2], 0);
  assert.ok(o.tono >= 95 && o.tono <= 124, `tono ${o.tono}`);
  const salidas = s.recoger();
  assert.ok(salidas.some((x) => x.tipo === "objeto_aterriza"));
  // El reloj se vuelve a poner al aterrizar: le quedan 120 desde aquí.
  assert.ok(Math.abs((o.caduca - o.vida) - CADUCA) < 1e-9);
});

test("ENCIMA DE UNA ENTIDAD: ni se tumba, ni suena, ni reinicia el reloj", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 100, 0], mirando: mirarAbajo(80) });
  const cabeceoAlSalir = o.angulos[0];
  assert.ok(cabeceoAlSalir !== 0);
  for (let i = 0; i < 200 && (o.estado === "naciendo" || o.estado === "cayendo"); i++) {
    s.paso(1 / 60, { traza: (a, b) => (b[1] < 0 ? { punto: [b[0], 0, b[2]], deEntidad: true } : null) });
  }
  assert.equal(o.estado, "posado");
  assert.equal(o.angulos[0], cabeceoAlSalir, "se queda con el cabeceo del tercio");
  assert.equal(o.tono, 0, "no ha sonado");
  const salidas = s.recoger();
  assert.ok(salidas.some((x) => x.tipo === "objeto_posa"));
  assert.ok(!salidas.some((x) => x.tipo === "objeto_aterriza"), "no hay aterrizaje");
  // Y el reloj es el de `FallInit`: 120 desde que lo soltaron, no desde aquí.
  assert.ok((o.caduca - o.vida) < CADUCA - 0.2,
    `le quedan ${o.caduca - o.vida} y si fueran 120 el reloj se habría reiniciado`);
});

test("posado se puede coger igual: FindEntityInSphere no mira el `solid`", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 100, 0], mirando: mirarAbajo(80) });
  for (let i = 0; i < 200 && (o.estado === "naciendo" || o.estado === "cayendo"); i++) {
    s.paso(1 / 60, { traza: (a, b) => (b[1] < 0 ? { punto: [0, 0, -40], deEntidad: true } : null) });
  }
  assert.equal(o.estado, "posado");
  const r = aMano(o, { ojo: [0, 60, 0], origen: [0, 36, 0], mirando: [0, 0, -1] });
  assert.ok(r.vale, `debería estar a mano: ${r.por}`);
});

test("posado caduca y se va, aunque nunca haya tocado suelo", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 100, 0], mirando: [0, 0, -1] });
  for (let i = 0; i < 20 && (o.estado === "naciendo" || o.estado === "cayendo"); i++) {
    s.paso(1 / 60, { traza: () => ({ punto: [0, 0, -40], deEntidad: true }) });
  }
  assert.equal(o.estado, "posado");
  for (let i = 0; i < 130; i++) s.paso(1, { traza: () => null });
  assert.equal(s.vivos.length, 0);
  assert.equal(s.cuentas.caducados, 1);
});

// ── 4. LOS DOS CANDADOS MUERTOS, y el que sí cierra ────────────────────────

test("a media estocada no se suelta, y lo dice", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1], atacando: true });
  assert.equal(o, null);
  assert.equal(s.vivos.length, 0);
  const [x] = s.recoger();
  assert.equal(x.tipo, "objeto_no_se_suelta");
  assert.equal(x.por, "atacando");
  assert.equal(x.mensaje, "You cannot drop Rusty Short Sword right now");
  assert.equal(s.cuentas.sueltasNegadas, 1);
});

test("`fNextActionTime` no cierra nada porque vale 0", () => {
  // El motor lo lee y no lo asigna en ningún sitio; la memoria de la entidad
  // viene a cero. Se pregunta con el valor del motor y la respuesta es que sí.
  assert.equal(puedeSoltar({ ahora: 0, hastaCuando: 0 }).vale, true);
  // Y el control de que la pregunta existe: con un valor puesto a mano cierra.
  assert.equal(puedeSoltar({ ahora: 1, hastaCuando: 5 }).por, "fNextActionTime");
});

test("`sethand undroppable` no sale en ningún guion del juego", () => {
  // El tercer candado de `CanDrop`. La pregunta existe y nada la activa, así que
  // en Master Sword todo lo que llevas encima se puede soltar.
  assert.equal(puedeSoltar({ indroppable: true }).por, "undroppable");
  assert.equal(puedeSoltar({}).vale, true);
});

test("no se puede soltar lo que no se lleva: sin guion no hay objeto", () => {
  const s = suelo();
  assert.equal(s.tirar({ guion: "no_existe", ojo: [0, 60, 0], mirando: [0, 0, -1] }), null);
  assert.equal(s.vivos.length, 0);
  assert.equal(s.recoger()[0].tipo, "objeto_sin_guion");
});

// ── 5. EL MENSAJE, que es del guion del jugador y no nuestro ───────────────

test("«You drop <nombre>», con el nombre del catálogo", () => {
  const s = suelo();
  s.tirar({ guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1] });
  const [x] = s.recoger();
  assert.equal(x.tipo, "objeto_soltado");
  assert.equal(x.mensaje, "You drop Rusty Short Sword");
});

// ── 6. EL LECTOR DE `game_fall` CONTRA UN SEGUNDO CASO DE VERDAD ───────────
//
// Es lo que el 71 no pudo tener: con un solo objeto —la manzana— «he leído el
// guion» y «he acertado el número» son el mismo verde. Una espada va por
// `base_weapon`, que suma 2; la manzana lo anula con 1.

test("la espada va por `base_weapon` y suma 2 sobre la mano", () => {
  const f = leerFichaObjeto(SCRIPTS, "items/swords_rsword");
  assert.ok(f, "falta ../MSC/MSCScripts");
  assert.equal(f.enElMundo.cuerpoSuelo, f.enElMundo.cuerpo + 2);
  assert.equal(f.enElMundo.animacionSuelo, "shortsword_floor_idle");
});

test("y la manzana lo anula con 1: la fórmula no es una sola", () => {
  const a = leerFichaObjeto(SCRIPTS, "items/health_apple");
  const e = leerFichaObjeto(SCRIPTS, "items/swords_rsword");
  assert.ok(a && e);
  const dA = a.enElMundo.cuerpoSuelo - a.enElMundo.cuerpo;
  const dE = e.enElMundo.cuerpoSuelo - e.enElMundo.cuerpo;
  assert.equal(dA, 1);
  assert.equal(dE, 2);
  assert.notEqual(dA, dE, "si coincidieran, `caidaDe` sería adorno y bastaría el +2");
});

test("el zurrón va por su propia cuenta y tampoco es +2", () => {
  const f = leerFichaObjeto(SCRIPTS, "items/pack_sack");
  assert.ok(f);
  assert.equal(f.enElMundo.cuerpoSuelo, 5);
  assert.notEqual(f.enElMundo.cuerpoSuelo, f.enElMundo.cuerpo + 2);
});

test("la mano de relámpago no tiene modelo del mundo, y eso es correcto", () => {
  // `const MODEL_WORLD none` (magic_hand_base.script:24) -> `WorldModel = ""`
  // (genericitem.cpp:1961-1962) -> el `if (WorldModel.len())` de `Drop` no entra
  // y el `EF_NODRAW` no se quita: está en el suelo y no se ve.
  const f = leerFichaObjeto(SCRIPTS, "items/magic_hand_lightning_weak");
  assert.ok(f);
  const m = f.enElMundo.modeloSuelo ?? f.enElMundo.modelo;
  assert.ok(!m || m === "none", `MODEL_WORLD debería ser none y es ${m}`);
});

// ── 7. LAS CUENTAS, que se calculan ────────────────────────────────────────

test("las cuentas de soltar salen de lo que ha pasado", () => {
  const s = suelo();
  s.tirar({ guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1] });
  s.tirar({ guion: "swords_rsword", ojo: [0, 60, 0], mirando: [0, 0, -1], atacando: true });
  s.tirar({ guion: "health_apple", ojo: [0, 60, 0], mirando: [0, 0, -1] });
  assert.equal(s.cuentas.tirados, 2);
  assert.equal(s.cuentas.sueltasNegadas, 1);
  assert.equal(s.vivos.length, 2);
});

test("el censo dice si algo está tirado y cuántas veces se ha posado", () => {
  const s = suelo();
  const o = s.tirar({ guion: "swords_rsword", ojo: [0, 100, 0], mirando: [0, 0, -1] });
  for (let i = 0; i < 20 && (o.estado === "naciendo" || o.estado === "cayendo"); i++) {
    s.paso(1 / 60, { traza: () => ({ punto: [0, 0, -40], deEntidad: true }) });
  }
  const [c] = s.censo();
  assert.equal(c.tirado, true);
  assert.equal(c.estado, "posado");
  assert.equal(c.posados, 1);
});

test("un objeto nacido de un aparecedor no está `tirado`", () => {
  const s = suelo();
  s.soltar({ guion: "health_apple", donde: [0, 100, 0] });
  assert.equal(s.censo()[0].tirado, false);
});

// ── 8. Y QUE EL OBJETO SUELTO SIGA SIENDO EL DEL 71 ────────────────────────

test("tirar y nacer acaban en la misma clase y el mismo reloj", () => {
  const a = new ObjetoSuelto({ guion: "x", velocidad: [1, 2, 3], tirado: true });
  assert.deepEqual(a.vel, [1, 2, 3]);
  const b = new ObjetoSuelto({ guion: "x" });
  assert.deepEqual(b.vel, [0, 0, 0]);
  assert.equal(b.tirado, false);
});
