// EL 97: EL ATURDIMIENTO Y LA LENTITUD DEL JUGADOR.
//
// Lo que se prueba, y por dónde entra:
//
//   - El aturdimiento lo pone el GUION DEL JABALÍ: `new GuionDeNpc` con
//     `monsters/boar` leído de `../MSC/`, embistiendo (`BOAR_IS_CHARGING 1`), y
//     el golpe le llega por la costura `game_damaged_other`, que es como lo
//     manda el juego (src/juego/interacciones.js). De ahí `boar_charge_hit` ->
//     `applyeffect ent_laststruckbyme effects/debuff_stun 3 …`
//     (boar_base.script:178-184) -> el gancho `aplicarEfecto` -> el jugador.
//   - El jugador es el `GuionDelJugador` de verdad, con `build/msr/jugador.json`
//     y los efectos horneados: el dado y la resistencia los tira el guion.
//   - El yelmo entra como en el 96: en `personaje.objetos`, `GuionDeObjeto` con
//     su guion horneado y `vestir`.
//   - La lentitud la pone la ARMADURA del fénix con fuerza < 40, por su guion
//     (armor_base.script:173-182). No hay un `applyeffect` escrito aquí para
//     ella.
//   - Lo que frena se mide ANDANDO: la cadena de `main.js` —`velocidadAndando`,
//     `ajustarVelocidad`, `velocidadConTrabas`— y `pasoDeVelocidad`, el modelo
//     de `PM_WalkMove`, dando pasos con la tecla puesta hasta que la velocidad
//     se asienta. No se lee el porcentaje y se da por bueno (CLAUDE.md §3:
//     «se mide el efecto, no el valor de la ventana»).
//
// Ver src/play/trabas.js y doc/ATURDIR_97.md.

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import { crearPersonaje } from "../src/juego/personaje.js";
import { atributosDe } from "../src/juego/stats.js";
import { GuionDelJugador } from "../src/play/guionjugador.js";
import { GuionesDeObjeto, GuionDeObjeto, QUIEN_VISTE } from "../src/play/guionobjeto.js";
import { TablaDeEfectos } from "../src/play/efectos.js";
import { GuionDeNpc, RelojDeGuiones } from "../src/play/npcguion.js";
import { vestir, fichasPuestas, seVisteAlCargar } from "../src/play/armadura.js";
import { trabasDe, trabasDelJugador, velocidadConTrabas, SV_MAXSPEED } from "../src/play/trabas.js";
import { velocidadAndando, ajustarVelocidad, pasoDeVelocidad } from "../src/play/movimiento.js";
import { partirGuion, Guion, entornoVacio } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { cargarGuion, RAIZ_POR_OMISION } from "../tools/scriptsmsr.mjs";

const OBJETOS = "build/msr/objetos.json";
const GUIONES = "build/msr/objetosguion.json";
const JUGADOR = "build/msr/jugador.json";
const EFECTOS = "build/msr/efectosguion.json";
const hay = [OBJETOS, GUIONES, JUGADOR, EFECTOS].every(existsSync);
const hayMod = existsSync(`${RAIZ_POR_OMISION}/monsters/boar_base.script`);
const leer = (f) => JSON.parse(readFileSync(f, "utf8"));

const catalogo = hay ? leer(OBJETOS) : null;
const lista = catalogo ? (Array.isArray(catalogo.objetos) ? catalogo.objetos : Object.values(catalogo.objetos)) : [];
const fichaDe = (id) => lista.find((o) => o.id === id) ?? null;
const guiones = hay ? new GuionesDeObjeto(leer(GUIONES)) : null;
const fichaJugador = hay ? leer(JUGADOR) : null;
const tablaEfectos = hay ? new TablaDeEfectos(leer(EFECTOS)) : null;

/** Un personaje con su guion y lo que lleva, montado como en `main.js` (el 96). */
function montar({ llevar = [], hacha = 0 } = {}) {
  const personaje = crearPersonaje({ nombre: "Ana" });
  if (hacha) for (const k of Object.keys(personaje.habilidades.axehandling)) personaje.habilidades.axehandling[k].valor = hacha;
  let t = 10;
  const dicho = [];
  const jugador = new GuionDelJugador({
    ficha: fichaJugador, personaje, efectos: tablaEfectos,
    suceso: (tipo, texto) => dicho.push({ tipo, texto: String(texto) }),
    consejo: () => {}, dar: () => {}, ahora: () => t, aviso: () => {},
  });
  const vivos = new Map();
  for (const id of llevar) personaje.objetos.push({ id, n: 1 });
  for (const o of personaje.objetos) {
    if (!guiones.tiene(o.id)) continue;
    const ent = new GuionDeObjeto({ guiones, id: o.id, jugador, ahora: () => t, suceso: () => {} });
    ent.arrancar({ genero: "male", quien: QUIEN_VISTE.CARGA, viste: seVisteAlCargar(fichaDe(o.id), o), puesto: Boolean(o.puesto) });
    vivos.set(o.id, ent);
  }
  const avanzar = (s) => {
    for (let k = 0; k < Math.round(s / 0.05); k++) {
      t += 0.05;
      for (const e of vivos.values()) e.paso(0.05);
      jugador.paso(0.05);
    }
  };
  const ponerse = (id) => vestir({
    entrada: personaje.objetos.find((o) => o.id === id), ficha: fichaDe(id), objeto: vivos.get(id) ?? null,
    puestas: fichasPuestas(personaje.objetos, fichaDe),
  });
  const ahora = () => t;
  return { personaje, jugador, vivos, dicho, avanzar, ponerse, ahora };
}

/**
 * EL JABALÍ DE EDANA, embistiendo, con su guion de verdad. Devuelve `pega()`,
 * que es lo que el juego le manda cuando su golpe entra: `StoreEntity(...,
 * ENT_LASTSTRUCKBYME)` y `game_damaged_other` (giattack.cpp:1754-1759), por la
 * misma costura que usa src/juego/interacciones.js.
 */
function jabali(m, { corneado = true } = {}) {
  const reloj = new RelojDeGuiones();
  const g = new GuionDeNpc({
    ficha: cargarGuion("monsters/boar"), npc: { nombre: "Boar", script: "monsters/boar" },
    programar: (s, que) => reloj.programar(s, que),
    aplicarEfecto: (ruta, params, o) => m.jugador.efectos.aplicar(ruta, params, o),
  });
  g.jugador = { personaje: m.personaje, ref: "jugador1" };
  // Su primera cornada, el evento de animación `gore_forward` (boar.script:
  // 24-28): deja `PUSH_VEL` puesto. Sin ella el `if` VIEJO de la cabeza de su
  // `game_damaged_other` (boar_base.script:90) abandona el bloque entero, y
  // la embestida no aturde — ver la prueba de abajo.
  if (corneado) g.guion.llamar("gore_forward", []);
  return {
    g,
    pega() {
      g.guion.vars.set("BOAR_IS_CHARGING", "1");
      g.entorno.golpeadoPorMi = "jugador1";
      return g.costura("game_damaged_other", ["jugador1", "10.00", "blunt", "(none)"]);
    },
  };
}

/**
 * LO QUE ANDA, medido: la cadena de `main.js` y `pasoDeVelocidad` con la tecla
 * puesta durante tres segundos. Devuelve la rapidez final en u/s.
 */
function andar(m, { adelante = 1, lado = 0 } = {}) {
  const atr = atributosDe(m.personaje.habilidades);
  const fSpeed = ajustarVelocidad(velocidadAndando({ agilidad: atr.agility, peso: 0, carga: 25 }), {});
  const tr = trabasDelJugador(m.jugador);
  if (tr.noMover) { adelante = 0; lado = 0; }
  const { maxima, tope } = velocidadConTrabas(fSpeed, tr.porcentaje);
  let v = [0, 0, 0];
  for (let k = 0; k < 300; k++) {
    v = pasoDeVelocidad(v, { intencion: { adelante, lado }, yaw: 0, maxima, tope, dt: 0.01, enSuelo: true }).velocidad;
  }
  return { rapidez: Math.hypot(v[0], v[2]), fSpeed, trabas: tr };
}

const cerca = (a, b, eps = 0.05) => Math.abs(a - b) < eps;

describe("las trabas de los efectos, leídas como las lee el motor (97)", () => {
  // Si hay un analizador, la prueba le da TEXTO (el 67).
  const guionDe = (texto) => {
    const g = resolverGuion("x", (r) => (r === "x" ? partirGuion(texto) : null), new Set());
    const gu = new Guion({ eventos: g.eventos, preload: g.preload, entorno: entornoVacio() });
    gu.llamar("", []);
    return gu;
  };

  test("«50%» es 50 (`atof`, msmonsterserver.cpp:2833) y los efectos se MULTIPLICAN", () => {
    const a = guionDe("{\n setvard game.effect.id a\n setvard game.effect.movespeed 50%\n}");
    const b = guionDe("{\n setvard game.effect.id b\n setvard game.effect.movespeed 45\n}");
    assert.equal(trabasDe([{ guion: a, esEfecto: true }]).porcentaje, 50);
    assert.equal(trabasDe([{ guion: a, esEfecto: true }, { guion: b, esEfecto: true }]).porcentaje, 22.5);
  });

  test("la velocidad SÓLO la ponen los efectos (`VarExists(\"game.effect.id\")`, :2828)", () => {
    const g = guionDe("{\n setvard game.effect.movespeed 50\n}");
    assert.equal(trabasDe([{ guion: g, esEfecto: false }]).porcentaje, 0);
    // CONTROL: el mismo guion como efecto sí frena.
    assert.equal(trabasDe([{ guion: g, esEfecto: true }]).porcentaje, 50);
  });

  test("una bandera es «0» EXACTO (`!strcmp`); sin poner, el NOMBRE, que no lo es", () => {
    const sin = guionDe("{\n setvard game.effect.id a\n}");
    const con = guionDe("{\n setvard game.effect.id a\n setvard game.effect.canattack 0\n setvard game.effect.canjump 0.0\n}");
    const t0 = trabasDe([{ guion: sin, esEfecto: true }]);
    assert.equal(t0.noAtacar, false);
    const t1 = trabasDe([{ guion: con, esEfecto: true }]);
    assert.equal(t1.noAtacar, true);
    // «0.0» no es «0» para `strcmp`.
    assert.equal(t1.noSaltar, false);
  });

  test("EL FALLO: el porcentaje es además un TOPE en unidades (pm_shared.cpp:3050-3053)", () => {
    assert.deepEqual(velocidadConTrabas(160, 50), { maxima: 80, tope: 50 });
    assert.deepEqual(velocidadConTrabas(160, 0), { maxima: 160, tope: Infinity });
    assert.equal(velocidadConTrabas(160, 900).tope, SV_MAXSPEED);
    // Adelante: 80 por eje pero el tope es 50.
    const paso = (adelante, maxima = 80, tope = 50) => {
      let v = [0, 0, 0];
      for (let k = 0; k < 300; k++) v = pasoDeVelocidad(v, { intencion: { adelante }, maxima, tope, dt: 0.01 }).velocidad;
      return Math.hypot(v[0], v[2]);
    };
    assert.ok(cerca(paso(1), 50), `adelante ${paso(1)}`);
    // Atrás: 0,5 × 80 = 40, por debajo del tope. Pero 40 es JUSTO el umbral
    // de `PM_Friction` con `sv_stopspeed 100` y `sv_friction 4`: por debajo
    // de 100 u/s el rozamiento quita 400 × dt y la aceleración da 10 × deseada
    // × dt, así que con una deseada de 40 o menos no se avanza — se repta lo
    // que da un paso de aceleración (4 u/s a 100 pasos por segundo).
    assert.ok(paso(-1) < 5, `atrás ${paso(-1)}`);
    // CONTROL: sin la lentitud, atrás son 80 y se anda.
    assert.ok(cerca(paso(-1, 160, Infinity), 80), `atrás sin lentitud ${paso(-1, 160, Infinity)}`);
  });
});

describe("el aturdimiento: el jabalí que embiste (97)", { skip: (!hay || !hayMod) && "faltan los horneados o ../MSC" }, () => {
  test("su `boar_charge_hit` aturde al jugador: «You have been stunned! ( n / 0 )»", () => {
    const m = montar();
    jabali(m).pega();
    const ef = m.jugador.efectos.activos.find((e) => e.id === "debuff_stun");
    assert.ok(ef, JSON.stringify(m.jugador.efectos.historial));
    const linea = m.dicho.find((d) => /stunned/.test(d.texto));
    assert.match(linea?.texto ?? "", /^You have been stunned! \( \d+ \/ 0 \)$/, JSON.stringify(m.dicho));
  });

  test("EL FALLO DEL `if` VIEJO: un jabalí que no ha corneado nunca embiste SIN aturdir", () => {
    // `if PUSH_VEL isnot 'PUSH_VEL'` (boar_base.script:90) sin paréntesis:
    // falso abandona el bloque (script.cpp:5754-5758, el 67), y `PUSH_VEL`
    // sólo lo ponen las cornadas (boar.script:27, :34, :39).
    const m = montar();
    jabali(m, { corneado: false }).pega();
    assert.equal(m.jugador.efectos.historial.length, 0, JSON.stringify(m.jugador.efectos.historial));
    assert.equal(trabasDelJugador(m.jugador).noAtacar, false);
  });

  test("ATURDIDO: no ataca, no salta, y anda a 45 u/s —el TOPE, no el 45 %—", () => {
    const m = montar();
    const libre = andar(m);
    jabali(m).pega();
    const preso = andar(m);
    assert.equal(preso.trabas.noAtacar, true);
    assert.equal(preso.trabas.noSaltar, true);
    assert.equal(preso.trabas.noMover, false);
    assert.equal(preso.trabas.porcentaje, 45);
    // CONTROL POSITIVO: sin él anda lo suyo, y lo suyo pasa de 45/0,45 = 100.
    assert.ok(cerca(libre.rapidez, libre.fSpeed), `libre ${libre.rapidez} de ${libre.fSpeed}`);
    assert.ok(libre.fSpeed * 0.45 > 45, "si el 45 % no pasara del tope, no se distinguiría cuál de los dos manda (el 71)");
    assert.ok(cerca(preso.rapidez, 45), `aturdido ${preso.rapidez}`);
  });

  test("a los TRES segundos se le pasa (debuff_stun 3, boar_base.script:183)", () => {
    const m = montar();
    jabali(m).pega();
    m.avanzar(2.9);
    assert.equal(trabasDelJugador(m.jugador).noAtacar, true, "se pasó antes de tiempo");
    m.avanzar(0.3);
    const t = trabasDelJugador(m.jugador);
    assert.equal(t.noAtacar, false);
    assert.equal(t.porcentaje, 0);
  });

  test("EL FALLO DE LA RESERVA: a la cuarta seguida «You have been stunned!» y NO lo está", () => {
    // `base_debuff_diminishing`: diez segundos de reserva por tipo, uno de
    // vuelta cada cuatro (:17-18). La tirada y su mensaje van ANTES de mirar
    // la reserva (debuff_stun.script:22-33 está «above the include on
    // purpose»), así que el juego anuncia un aturdimiento que no aplica.
    const m = montar();
    const j = jabali(m);
    const duraciones = [];
    for (let n = 0; n < 5; n++) {
      j.pega();
      const t0 = m.ahora();
      while (trabasDelJugador(m.jugador).noAtacar && m.ahora() - t0 < 10) m.avanzar(0.05);
      duraciones.push(Math.round((m.ahora() - t0) * 10) / 10);
      m.avanzar(0.25);
    }
    const anuncios = m.dicho.filter((d) => /^You have been stunned!/.test(d.texto)).length;
    assert.equal(anuncios, 5, JSON.stringify(m.dicho));
    // 3 + 3 + 3 + lo que quede de los diez + nada.
    assert.deepEqual(duraciones.slice(0, 3), [3.1, 3.1, 3.1]);
    assert.ok(duraciones[3] > 0 && duraciones[3] < 3, `cuarta ${duraciones[3]}`);
    assert.equal(duraciones[4], 0, `quinta ${duraciones[4]}: anunciado y sin aturdir`);
  });
});

describe("el yelmo de estabilidad contra el aturdimiento (97)", { skip: (!hay || !hayMod) && "faltan los horneados o ../MSC" }, () => {
  /** N embestidas, esperando a que se pase cada una y a que la reserva vuelva. */
  function tiradas(m, n) {
    const j = jabali(m);
    const out = { resiste: 0, aturde: 0, lineas: [] };
    for (let k = 0; k < n; k++) {
      const antes = m.dicho.length;
      j.pega();
      const nuevas = m.dicho.slice(antes).map((d) => d.texto);
      out.lineas.push(...nuevas);
      if (nuevas.some((x) => /^You resist being stunned!/.test(x))) out.resiste++;
      if (nuevas.some((x) => /^You have been stunned!/.test(x))) out.aturde++;
      m.avanzar(3.2);
      // La reserva: 3 s gastados vuelven en 12 (un segundo cada cuatro).
      m.avanzar(12.5);
    }
    return out;
  }

  test("CONTROL POSITIVO: sin yelmo, 0 de 60 resiste — `100 - 100 × 1.0` es 0 y la tirada es 1-100", () => {
    const m = montar();
    const r = tiradas(m, 60);
    assert.equal(r.resiste, 0);
    assert.equal(r.aturde, 60);
  });

  test("con el yelmo PUESTO resiste ~70 % y lo dice con su tirada: «( n / 70 )»", () => {
    const m = montar({ llevar: ["armor_helm_gray"] });
    assert.equal(m.ponerse("armor_helm_gray").puesto, true);
    m.avanzar(0.5);
    assert.equal(m.jugador.resistencias.leer("stun"), "0.30");
    const r = tiradas(m, 200);
    const p = r.resiste / 200;
    // Binomial de 200 con p = 0,7: σ = 3,2 %. Cuatro sigmas a cada lado.
    assert.ok(p > 0.57 && p < 0.83, `resiste ${r.resiste} de 200`);
    assert.equal(r.resiste + r.aturde, 200);
    assert.ok(r.lineas.some((x) => /^You resist being stunned! \( \d+ \/ 70 \)$/.test(x)), r.lineas.slice(0, 4).join(" | "));
    assert.ok(r.lineas.some((x) => /^You have been stunned! \( \d+ \/ 70 \)$/.test(x)), r.lineas.slice(0, 4).join(" | "));
  });

  test("el yelmo EN LA MOCHILA no resiste nada (su `game_wear` no corre)", () => {
    const m = montar({ llevar: ["armor_helm_gray"] });
    m.avanzar(0.5);
    assert.equal(tiradas(m, 30).resiste, 0);
  });

  test("y el que resiste no queda trabado: ni tope ni banderas", () => {
    const m = montar({ llevar: ["armor_helm_gray"] });
    m.ponerse("armor_helm_gray");
    m.avanzar(0.5);
    const j = jabali(m);
    for (let k = 0; k < 40; k++) {
      const antes = m.dicho.length;
      j.pega();
      const dijo = m.dicho.slice(antes).map((d) => d.texto).join(" ");
      const t = trabasDelJugador(m.jugador);
      if (/resist being stunned/.test(dijo)) {
        assert.equal(t.noAtacar, false, dijo);
        assert.equal(t.porcentaje, 0, dijo);
        return;
      }
      m.avanzar(16);
    }
    assert.fail("en 40 tiradas al 70 % no resistió ninguna");
  });
});

describe("el escudo levantado: inmune (`nopush`, 97)", { skip: (!hay || !hayMod) && "faltan los horneados o ../MSC" }, () => {
  test("`ext_shield_up 1` -> bandera `nopush` -> `m_nopush` -> «You are immune to stun effects.»", () => {
    const m = montar();
    // Lo que llama el escudo al levantarse (items/shields_base.script:107-111).
    m.jugador.llamar("ext_shield_up", ["1"]);
    assert.equal(m.jugador.nopush, true, JSON.stringify(m.jugador.guion.noSoportados));
    jabali(m).pega();
    assert.ok(m.dicho.some((d) => d.texto === "You are immune to stun effects."), JSON.stringify(m.dicho));
    assert.equal(trabasDelJugador(m.jugador).noAtacar, false);
  });

  test("CONTROL: al bajarlo, `ext_shield_up 0`, vuelve a aturdir", () => {
    const m = montar();
    m.jugador.llamar("ext_shield_up", ["1"]);
    m.jugador.llamar("ext_shield_up", ["0"]);
    assert.equal(m.jugador.nopush, false);
    jabali(m).pega();
    assert.equal(trabasDelJugador(m.jugador).noAtacar, true, JSON.stringify(m.dicho));
  });
});

describe("la lentitud de la armadura sin fuerza: `effect_slow` (97)", { skip: !hay && "faltan los horneados" }, () => {
  test("con fuerza 2 y el fénix PUESTO: a 50 u/s, no al 50 %, y sin saltar", () => {
    const m = montar({ llevar: ["armor_pheonix55"] });
    const libre = andar(m);
    m.ponerse("armor_pheonix55");
    m.avanzar(0.2);
    const lento = andar(m);
    assert.ok(m.dicho.some((d) => d.texto === "You are being slowed."), JSON.stringify(m.dicho));
    assert.equal(lento.trabas.porcentaje, 50);
    assert.equal(lento.trabas.noSaltar, true);
    // `effect_slow` no quita el ataque (effects/effect_slow.script:14-21).
    assert.equal(lento.trabas.noAtacar, false);
    assert.ok(cerca(libre.rapidez, libre.fSpeed), `libre ${libre.rapidez}`);
    assert.ok(cerca(lento.rapidez, 50), `lento ${lento.rapidez} (el 50 % sería ${libre.fSpeed / 2})`);
  });

  test("CONTROL: con fuerza 40 justa no hay lentitud y anda lo suyo", () => {
    const m = montar({ llevar: ["armor_pheonix55"], hacha: 77 });
    assert.equal(atributosDe(m.personaje.habilidades).strength, 40);
    m.ponerse("armor_pheonix55");
    m.avanzar(0.5);
    const a = andar(m);
    assert.equal(a.trabas.porcentaje, 0);
    assert.ok(cerca(a.rapidez, a.fSpeed), `${a.rapidez} de ${a.fSpeed}`);
  });

  test("cada diez segundos se renueva y NO se amontona: nunca dos `effect_slow` vivos más de un paso", () => {
    // Con `game.time` sin «%.2f» se amontonaban: 50 % -> 25 % -> 12,5 % a los
    // 40 s (doc/ATURDIR_97.md §3). Ahora el fin redondeado se compara con un
    // reloj redondeado, como en el motor.
    const m = montar({ llevar: ["armor_pheonix55"] });
    m.ponerse("armor_pheonix55");
    let peor = 100;
    let pasosConDos = 0;
    for (let k = 0; k < 900; k++) {
      m.avanzar(0.05);
      const t = trabasDelJugador(m.jugador);
      if (t.porcentaje) peor = Math.min(peor, t.porcentaje);
      const vivos = m.jugador.efectos.lista.filter((e) => !e.quitar && e.id === "slow").length;
      if (vivos > 1) pasosConDos++;
    }
    assert.equal(peor, 50, `llegó a ${peor}`);
    assert.ok(pasosConDos <= 4, `${pasosConDos} pasos con dos`);
    assert.ok(m.dicho.filter((d) => d.texto === "You are being slowed.").length >= 4);
  });
});
