// EXPERIMENTO 78 · `ms_npcscript` tipos 1 y 3: los que el 77 dejó PENDIENTES.
//
// El 77 escribió las dos ramas —`PlayAnim` y el `case SCRIPT_MOVE_PLAYANIM` de
// `MoveThink`— y las declaró pendientes en vez de contarlas verdes, porque **no
// hay un solo `ms_npcscript` de tipo 1 ni de tipo 3 en Gate City ni en Edana**.
// La regla del apartado 4 de CLAUDE.md dice qué hacer con eso: si hoy no hay
// segundo caso, se declara pendiente; y cuando lo haya, se mide.
//
// El segundo caso es un TERCER MAPA. `gertenheld_forest2` es el único del juego
// donde los dos tipos cuelgan de un `trigger_once` SIN NOMBRE, o sea del pie del
// jugador, sin pasar por una misión. Por eso es ése y no otro: se puede andar
// hasta el control.
//
// Lo que esto NO mide, dicho aquí:
//
//   - **cuánto dura una animación**. Sin `.mdl` `duracionDe` vale 0 (manada.js:130),
//     así que aquí la escena acaba en el primer `AnimateThink` y una prueba que
//     dijera «se queda congelado 2,1 s» estaría midiendo el cero. La duración y
//     la congelación son de `sondas/gertenheld78.mjs`, que abre el modelo.
//   - **que se vea**. Igual que el 77.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Escenas, TIPO, mueve, haLlegado } from "../src/play/escena.js";
import { Manada } from "../src/play/manada.js";
import { Aparecedor, delCenso } from "../src/play/aparecer.js";
import { leerBsp, leerModelos, leerTexinfo, leerTexturas, leerEntidades, leerCaras } from "../src/bsp/lector.js";
import { sePuedeEstar } from "../src/bsp/arbol.js";
import { MAPAS_PORTADOS } from "../src/play/mapa.js";

const MAPAS = process.env.MSR_ASSETS ?? "../MSC/assets/msr";
const DIR_MAPAS = join(MAPAS, "maps");
const hayMapas = existsSync(DIR_MAPAS);
const faltanMapas = { skip: hayMapas ? false : `falta ${DIR_MAPAS}` };

const RUTA = "build/gertenheld_forest2";
const hayMapa = existsSync(join(RUTA, "malla.json")) && existsSync(join(RUTA, "bichos.json"));
const malla = hayMapa ? JSON.parse(readFileSync(join(RUTA, "malla.json"), "utf8")) : null;
const censo = hayMapa ? JSON.parse(readFileSync(join(RUTA, "bichos.json"), "utf8")) : null;
const falta = { skip: hayMapa ? false : `falta ${RUTA}: \`npm run mapa -- --mapa gertenheld_forest2\`` };

/** Un `ms_npcscript` del horneado, por nombre. */
const porNombre = (n) => (malla?.disparadores ?? [])
  .find((d) => (d.clase === "ms_npcscript" || d.clase === "mstrig_act") && d.nombre === n) ?? null;

/** El centro de una cara, que es por donde se le pregunta al árbol. */
const centroDeCara = (c) => {
  const s = [0, 0, 0];
  for (const p of c.puntos) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
  return s.map((v) => v / c.puntos.length);
};

// ───────────────────────────────────────────────────────────────────────────
describe("78 · dónde viven los tipos 1 y 3, contado de los `.bsp`", () => {
  test("son 25 en 10 mapas, y ninguno en los dos que el 77 tenía", faltanMapas, () => {
    const porMapa = new Map();
    let total = 0;
    for (const f of readdirSync(DIR_MAPAS).filter((n) => n.endsWith(".bsp"))) {
      let ents;
      try { ents = leerEntidades(leerBsp(join(DIR_MAPAS, f))); } catch { continue; }
      for (const e of ents) {
        if (e.classname !== "ms_npcscript" && e.classname !== "mstrig_act") continue;
        const t = Number(e.type) || 0;
        if (t !== TIPO.ANIMAR && t !== TIPO.MOVER_Y_ANIMAR) continue;
        total++;
        porMapa.set(f, (porMapa.get(f) ?? 0) + 1);
      }
    }
    assert.equal(total, 25, `salen ${total}`);
    assert.equal(porMapa.size, 10);
    assert.equal(porMapa.get("gatecity.bsp"), undefined, "Gate City no tiene ninguno");
    assert.equal(porMapa.get("edana.bsp"), undefined, "Edana tampoco");
    assert.equal(porMapa.get("gertenheld_forest2.bsp"), 3, "el tercer mapa trae dos del 1 y uno del 3");
  });

  test("y el tercer mapa es el único con los dos tipos a pie del jugador", faltanMapas, () => {
    // Lo que hace falta no es «que haya uno»: es que se pueda ANDAR hasta él.
    // Un `trigger_once` sin `targetname` es el que pisa el jugador; uno con
    // nombre puede estar esperando a que una misión lo encienda, y entonces la
    // sonda no puede entrar por donde entra el jugador (apartado 3 de CLAUDE.md).
    const ents = leerEntidades(leerBsp(join(DIR_MAPAS, "gertenheld_forest2.bsp")));
    const aPie = (nombre, saltos = 2) => {
      let frente = [nombre];
      for (let n = 0; n < saltos; n++) {
        const quien = ents.filter((e) => frente.includes(e.target) ||
          (e.classname === "multi_manager" && frente.some((f) => Object.keys(e).includes(f))));
        if (quien.some((e) => e.classname.startsWith("trigger_") && !e.targetname)) return true;
        frente = quien.map((e) => e.targetname).filter(Boolean);
        if (!frente.length) return false;
      }
      return false;
    };
    assert.ok(aPie("JerdidIntroduction"), "el tipo 1 cuelga de un trigger_once sin nombre");
    assert.ok(aPie("Ghostturn"), "el tipo 3 también, a un salto de relé");
  });

  test("EL VALOR DE REPOSO: en este mapa el tipo 3 NO anda, y se dice", faltanMapas, () => {
    // El 77 se topó con esto en Edana y vuelve aquí igual: `Ghostturn` está a
    // **2 unidades** de donde nace Gurukk, y su proximidad es 35,2. O sea que
    // la pata de andar del tipo 3 se cumple en el primer paso sin dar ninguno.
    // Lo que SÍ recorre este caso es lo que el 77 no tenía: la transición
    // `case SCRIPT_MOVE_PLAYANIM: PlayAnim()` de `MoveThink` (npcact.cpp:255).
    //
    // Y se deja medido dónde buscar un tipo 3 que ande de verdad, para que la
    // sesión que lo quiera no tenga que volver a contar los 81 mapas: el más
    // largo es `runner1path5` de deralia (1 818 u), y los siguientes son
    // `kellyrun` de cleicert (949) y los dos del jefe de phobia (263 y 272).
    const ents = leerEntidades(leerBsp(join(DIR_MAPAS, "gertenheld_forest2.bsp")));
    const esc = ents.find((e) => e.targetname === "Ghostturn");
    const npc = ents.find((e) => e.targetname === esc.target);
    const o = esc.origin.split(" ").map(Number);
    const p = npc.origin.split(" ").map(Number);
    const d = Math.hypot(o[0] - p[0], o[1] - p[1]);
    assert.ok(d < 5, `salen ${d.toFixed(0)} unidades`);
    assert.ok(d < (censo?.colocados.find((c) => c.objetivo === "Gurukk")?.ia.cercaniaDeDestino ?? 35.2),
      "está dentro de su propio círculo de proximidad antes de empezar");
  });

  test("y el otro valor de reposo: `JerdidIntroduction` lo gira TRES grados", falta, () => {
    // `PlayAnim` hace `pMonster->pev->angles = pev->angles` (npcact.cpp:193), y
    // un control «se ha puesto a mirar al rumbo del mapa» sobre esta escena
    // sería verde antes de que pasara nada: Jerdid nace mirando a 325 y la
    // escena pide 322. La que lo puede probar es `Scareboi`, que pide 174.
    const j = censo.colocados.find((c) => c.objetivo === "Jerdid");
    assert.equal(j.yaw, 325);
    assert.equal(porNombre("JerdidIntroduction").angulos[1], 322);
    assert.ok(Math.abs(j.yaw - 322) < 5, "tres grados: no distingue nada");
    assert.ok(Math.abs(j.yaw - porNombre("Scareboi").angulos[1]) > 90,
      "`Scareboi` pide 174: eso sí es un giro");
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("78 · el control del árbol BSP: el cielo no es un suelo", () => {
  /** Las caras que miran hacia arriba del modelo 0, y si son de cielo. */
  function arriba(mapa) {
    const bsp = leerBsp(join(DIR_MAPAS, `${mapa}.bsp`));
    const texs = leerTexturas(bsp);
    const caras = leerCaras(bsp, leerModelos(bsp)[0], leerTexinfo(bsp))
      .filter((c) => c.normal[2] > 0.7)
      .sort((a, b) => b.area - a.area);
    const cielo = (c) => (texs[c.miptex]?.nombre ?? "").toLowerCase() === "sky";
    const separa = (cs) => {
      const m = cs.map(centroDeCara);
      if (!m.length) return null;
      const e = m.filter((t) => sePuedeEstar(bsp, [t[0], t[1], t[2] + 24])).length;
      const d = m.filter((t) => sePuedeEstar(bsp, [t[0], t[1], t[2] - 24])).length;
      return (e - d) / m.length;
    };
    return { caras, cielo, separa };
  }

  test("una cara de cielo contesta AL REVÉS que un suelo", faltanMapas, () => {
    // Es lo que rompía el control, y no es una opinión sobre el mapa: encima de
    // la cara de abajo de la caja de cielo está el propio brush —sólido— y
    // debajo está el mundo —hueco—. Un suelo da lo contrario, que es justo lo
    // que el control pide que se distinga.
    const { caras, cielo, separa } = arriba("gertenheld_forest2");
    const deCielo = caras.filter(cielo);
    const deSuelo = caras.filter((c) => !cielo(c));
    assert.ok(deCielo.length > 100, `hay ${deCielo.length} caras de cielo mirando hacia arriba`);
    assert.ok(separa(deCielo) < 0, `el cielo separa ${(separa(deCielo) * 100).toFixed(0)}, o sea al revés`);
    assert.ok(separa(deSuelo) > 0.5, `el suelo separa ${(separa(deSuelo) * 100).toFixed(0)}`);
  });

  test("LA MUESTRA era el fallo, no el umbral: las mayores son el cielo", faltanMapas, () => {
    // El control tomaba `.slice(0, 200)` de la lista ORDENADA POR ÁREA, y la
    // cara más grande que mira hacia arriba de un mapa al aire libre es el
    // cielo. En gertenheld_forest2 son 158 de las 200 primeras.
    const { caras, cielo } = arriba("gertenheld_forest2");
    const primeras = caras.slice(0, 200);
    assert.ok(primeras.filter(cielo).length > 150,
      `${primeras.filter(cielo).length} de las 200 mayores son cielo`);
  });

  test("con la muestra de ayer FALLABAN seis mapas con el árbol bien", faltanMapas, () => {
    // El número que importa: el control de `tools/gatecity.mjs` paraba el
    // horneado de seis de estos once, y en los once el árbol lee perfectamente.
    // Mientras hubo dos mapas portados esto no se podía ver, porque los dos
    // pasaban — y Edana pasaba por UN punto.
    const unos = ["gatecity", "edana", "gertenheld_forest2", "cleicert", "hemlock",
      "old_helena", "helena", "phobia", "calruin2", "deralia", "thornlands_north"];
    let fallabanAyer = 0;
    for (const m of unos) {
      if (!existsSync(join(DIR_MAPAS, `${m}.bsp`))) continue;
      const { caras, cielo, separa } = arriba(m);
      if (separa(caras.slice(0, 200)) < 0.5) fallabanAyer++;
      // Y hoy: todas las caras de suelo de verdad, sin muestrear.
      assert.ok(separa(caras.filter((c) => !cielo(c))) > 0.5,
        `${m}: hoy separa ${(separa(caras.filter((c) => !cielo(c))) * 100).toFixed(0)}`);
    }
    assert.ok(fallabanAyer >= 6, `fallaban ${fallabanAyer}`);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("78 · lo que el horneado de bichos no pedía", () => {
  test("las animaciones que nombra el MAPA están horneadas", falta, () => {
    // El fallo: la lista blanca de `tools/bichos.mjs` salía de la ficha del NPC,
    // y `actionanim`/`moveanim` no están en ninguna ficha — son del `.bsp`. Así
    // que ninguna animación de escena del juego se había horneado nunca, y no
    // daba error porque el visor cae a la secuencia 0: el NPC «hace» la escena
    // quieto. Se comprueba contra el MANIFIESTO, que es lo que lee el juego.
    const pide = new Map();
    for (const d of malla.disparadores) {
      if (d.clase !== "ms_npcscript" && d.clase !== "mstrig_act") continue;
      for (const a of [d.animDeAccion, d.animDeAndar]) {
        if (a) pide.set(String(a).toLowerCase(), d.npc);
      }
    }
    assert.ok(pide.size >= 5, `el mapa pide ${pide.size} animaciones distintas`);
    for (const [anim, npc] of pide) {
      const c = censo.colocados.find((x) => x.objetivo === npc);
      if (!c) continue;                       // el NPC no está en este mapa
      const m = censo.modelos.find((x) => x.clave === c.clave);
      assert.ok(m.secuencias.some((s) => s.toLowerCase() === anim),
        `${npc} no tiene horneada '${anim}', que le pide el mapa`);
    }
  });

  test("y sigue siendo una lista blanca: lo que nadie nombra NO se hornea", falta, () => {
    // El control positivo. Sin esto, «están todas» pasaría también si el
    // horneado hubiera dejado de filtrar y metiera las 129 secuencias del
    // modelo: el verde no distinguiría «pide bien» de «no filtra».
    const c = censo.colocados.find((x) => x.objetivo === "Jerdid");
    const m = censo.modelos.find((x) => x.clave === c.clave);
    assert.ok(m.secuencias.length < 30,
      `se hornean ${m.secuencias.length}, no las 129 del modelo`);
    assert.ok(!m.secuencias.some((s) => s.toLowerCase() === "tieshoe"),
      "`tieshoe` está en el .mdl y no la nombra nadie: no se hornea");
  });

  test("el tercer mapa está en la lista de portados, que es por donde entra el menú", () => {
    assert.ok(MAPAS_PORTADOS.includes("gertenheld_forest2"));
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("78 · las dos escenas, con la manada y el mapa de verdad", () => {
  /**
   * El bosque, con sus 74 bichos — que nacen TODOS dormidos.
   *
   * Aquí no hay ni un `ms_npc` suelto: los 74 salen de un `ms_monsterspawn`, y
   * hasta que su área los saca no existen. Eso no se saltea poniendo
   * `i.dormido = false` a mano: se tica el `Aparecedor` como lo tica el juego
   * (`src/render/bichos.js:432`), porque un NPC sacado a mano no es el NPC que
   * el jugador se encuentra — es la trampa del 59, y en este archivo habría
   * sido fácil caer en ella.
   */
  function bosque() {
    const m = new Manada(censo, { azar: () => 0.5 });
    const ap = new Aparecedor({ ...delCenso(censo), azar: () => 0.5 });
    // Que salgan. Las áreas tienen `delaylow 1` / `delayhigh 2`, así que con
    // tres segundos sobra; si no sale nadie, la prueba lo dice aquí y no
    // quince líneas más abajo con un `i` indefinido.
    for (let n = 0; n < 60; n++) {
      for (const s of ap.tic(0.1)) {
        if (s.que !== "aparece") continue;
        const i = m.de(s.id);
        if (!i) continue;
        m.revivir(i);
        i.dormido = false;
      }
    }
    const jerdid = m.porObjetivo("Jerdid");
    const gurukk = m.porObjetivo("Gurukk");
    assert.ok(jerdid, "Jerdid ha salido de `CriticalNPCsSpawn`");
    assert.ok(gurukk, "Gurukk ha salido de `HomesteadGhost`");
    jerdid.velocidad = 1; jerdid.velocidadCorriendo = 2;
    gurukk.velocidad = 1; gurukk.velocidadCorriendo = 2;

    const eventos = [];
    const disparos = [];
    const t = { v: 0 };
    const asas = new Map([
      ["Jerdid", m.asaDeEscena(jerdid, { evento: (n, p) => { eventos.push([n, ...(p ?? [])]); return true; } })],
      ["Gurukk", m.asaDeEscena(gurukk, { evento: (n, p) => { eventos.push([n, ...(p ?? [])]); return true; } })],
    ]);
    const apuntes = [];
    const d = new Escenas({
      reloj: () => t.v,
      npcPorNombre: (n) => asas.get(n) ?? null,
      disparar: (n, quien) => disparos.push({ n, quien }),
      apuntar: (q) => apuntes.push(q),
    });
    const U = m.U;
    const deMapa = (nombre) => {
      const e = porNombre(nombre);
      assert.ok(e, `${nombre} está en el horneado`);
      return {
        i: e.entidad, nombre: e.nombre, tipo: e.tipo, npc: e.npc,
        eventoDelNpc: e.eventoDelNpc, animDeAndar: e.animDeAndar,
        animDeAccion: e.animDeAccion, alAcabar: e.alAcabar, alCortarse: e.alCortarse,
        retrasoAlAcabar: e.retrasoAlAcabar, paraLaIa: e.paraLaIa,
        origen: e.escena.map((v) => v * U), angulos: e.angulos,
      };
    };
    const paso = (dt, i) => {
      t.v += dt;
      m.pasear(dt, { libre: () => true, suelo: () => i.donde[1] });
      d.paso();
    };
    const grados = (i) => ((i.yaw * 180) / Math.PI + 360) % 360;
    return { m, d, t, jerdid, gurukk, eventos, disparos, apuntes, U, deMapa, paso, grados };
  }

  // ── TIPO 1 ───────────────────────────────────────────────────────────────

  test("tipo 1 · `Scareboi` gira a Jerdid 151° y le pide `fear2`", falta, () => {
    const { d, jerdid, deMapa, grados } = bosque();
    const antes = [...jerdid.donde];
    assert.equal(Math.round(grados(jerdid)), 325);
    const e = deMapa("Scareboi");
    assert.equal(e.tipo, TIPO.ANIMAR);
    assert.equal(mueve(e.tipo), false, "el tipo 1 no anda: `Act` no entra en la rama de mover");
    assert.equal(d.empezar(e), null, "no la rechaza ninguna guarda");
    // `pMonster->pev->angles = pev->angles` — npcact.cpp:193.
    assert.equal(Math.round(grados(jerdid)), 174);
    // `SetAnimation(MONSTER_ANIM_ONCE, m_sActionAnim)` — :198.
    assert.equal(jerdid.animPedida, "fear2");
    // Y NO le ha puesto un destino: `moveanim idle1` está en el mapa y el motor
    // sólo lo lee dentro de la rama de mover (:160), donde el tipo 1 no entra.
    assert.equal(jerdid.mandado, null);
    assert.deepEqual(jerdid.donde, antes, "no se ha movido un milímetro");
  });

  test("tipo 1 · lo congela, y lo suelta al acabar la secuencia", falta, () => {
    const { d, jerdid, deMapa, paso } = bosque();
    d.empezar(deMapa("Scareboi"));
    // `pMonster->m_MonsterState = MONSTERSTATE_SCRIPT` — npcact.cpp:181. El
    // tipo 1 SÍ pasa por ahí, y el tipo 2 no: ver el 77.
    assert.equal(jerdid.enEscena, true);
    assert.equal(d.censo().length, 1);
    assert.equal(d.censo()[0].fase, "animando");
    // Y se suelta cuando el mezclador dice que la secuencia acabó
    // (`m_fSequenceFinished`, :276). Sin `.mdl` eso es inmediato: lo que esta
    // prueba afirma es el CAMINO, no el plazo.
    paso(0.15, jerdid);
    assert.equal(jerdid.enEscena, false);
    assert.equal(d.censo().length, 0);
  });

  test("tipo 1 · `JerdidIntroduction` recorre lo mismo, con otra animación", falta, () => {
    // El segundo caso dentro del mapa: dos tipo 1 sobre el MISMO NPC con
    // animaciones distintas. Si una de las dos estuviera cableada, esto lo ve.
    const { d, jerdid, deMapa } = bosque();
    assert.equal(d.empezar(deMapa("JerdidIntroduction")), null);
    assert.equal(jerdid.animPedida, "wave");
  });

  // ── TIPO 3 ───────────────────────────────────────────────────────────────

  test("tipo 3 · `Ghostturn` pasa de andar a animar sin que nadie lo empuje", falta, () => {
    const { d, gurukk, deMapa, paso, grados } = bosque();
    const e = deMapa("Ghostturn");
    assert.equal(e.tipo, TIPO.MOVER_Y_ANIMAR);
    assert.equal(mueve(e.tipo), true);
    assert.equal(d.empezar(e), null);
    // Primero la rama de mover: destino puesto y `moveanim walk` pedida (:160).
    assert.equal(d.censo()[0].fase, "andando");
    assert.equal(gurukk.animPedida, "walk");
    assert.ok(gurukk.mandado, "tiene destino mandado");
    // Y como el destino está a 2 unidades, llega en el primer paso de la manada
    // y la escena se entera en su siguiente `MoveThink`. Lo que se afirma es la
    // TRANSICIÓN, que es lo que el 77 no podía recorrer.
    paso(0.05, gurukk);
    paso(0.1, gurukk);
    assert.equal(gurukk.mandado, null, "la manada ha llegado");
    assert.equal(gurukk.animPedida, "anim_seal", "`case SCRIPT_MOVE_PLAYANIM: PlayAnim()` — :255");
    assert.equal(Math.round(grados(gurukk)), 259, "y mira al rumbo del mapa");
    assert.deepEqual(d.diario.map((x) => x.que), ["anda", "anima"]);
  });

  test("tipo 3 · y al acabar espera su `firedelay` de 0,2 s y dispara", falta, () => {
    const { d, t, gurukk, disparos, deMapa, paso } = bosque();
    const e = deMapa("Ghostturn");
    assert.equal(e.retrasoAlAcabar, 0.2, "`firedelay .2` del mapa");
    assert.equal(e.alAcabar, "SkeletonVanish", "`firewhendone`");
    d.empezar(e);
    paso(0.05, gurukk);
    paso(0.1, gurukk);                         // llega y pone `anim_seal`
    paso(0.1, gurukk);                         // la secuencia acaba (dura 0 sin .mdl)
    assert.deepEqual(d.diario.map((x) => x.que), ["anda", "anima", "espera"]);
    assert.equal(disparos.length, 0, "todavía no: el retraso no ha vencido");
    // La hora se le pregunta a la escena y no a mi espera — la lección del 77.
    const cuando = d.censo()[0].cuando;
    while (t.v < cuando + 0.05) paso(0.05, gurukk);
    assert.deepEqual(disparos.map((x) => x.n), ["SkeletonVanish"]);
    assert.equal(gurukk.enEscena, false);
  });

  test("tipo 3 · si otro le quita el destino a medio camino, se corta", falta, () => {
    // El `if (pMonster->m_MoveDest != m_MoveDest) Finish(true)` de :229, que en
    // el tipo 3 tiene una consecuencia que el tipo 0 no tiene: **no llega a
    // poner la animación**. Se le manda a mano a otro sitio, que es lo que hace
    // un `setmovedest` de un guion.
    const { m, d, t, gurukk, deMapa } = bosque();
    d.empezar(deMapa("Ghostturn"));
    assert.equal(d.censo()[0].fase, "andando");
    m.mandarA(gurukk, { origen: [gurukk.donde[0] * m.U + 400, gurukk.donde[1] * m.U, gurukk.donde[2] * m.U], proximidad: 5 });
    // Y SE DEJA PENSAR. Las dos primeras versiones de esta prueba llamaban a
    // `d.paso()` aquí mismo y salían rojas con el corte funcionando: una escena
    // no piensa hasta que vence su `nextthink`, 0,1 s después (:236). Es la
    // misma piedra del 77 —dos piezas con relojes distintos— y la pisé yo.
    t.v += 0.15;
    d.paso();
    assert.equal(d.censo().length, 0, "la escena se ha cortado");
    assert.notEqual(gurukk.animPedida, "anim_seal", "no ha llegado a animar");
  });

  test("tipo 3 · y el corte deja al fantasma sin desvanecerse PARA SIEMPRE", falta, () => {
    // ESTE CONTROL NACIÓ MAL Y EL CÓDIGO ESTABA BIEN. Lo escribí afirmando que
    // la segunda vez «dispara en el acto en vez de esperar sus 0,2 s», que es
    // lo que dice `Finish` (`if (m_flFireDelay && !m_EarlyBreak)`, :295) — y me
    // quedé en esa línea. Veinte más abajo está el resto:
    //
    //     string_t FireEvent = m_EarlyBreak ? m_sFireOnBreak : m_sFireWhenDone;
    //     if (FireEvent) FireTargets(...)                     npcact.cpp:318-320
    //
    // Con `m_EarlyBreak` pegado a `true` la escena deja de mirar su
    // `firewhendone` y mira su `fireonbreak`, **y `Ghostturn` no tiene**. Así
    // que el efecto no es «dispara antes»: es que `SkeletonVanish` no vuelve a
    // dispararse en toda la partida y el fantasma se queda ahí. Lo mismo le
    // pasa a los dos de hemlock, que sí traen `fireonbreak` y por eso disparan
    // la rama de matar al NPC cada vez que acaban bien.
    //
    // Es la lección del 77 repetida: antes de tocar el código, leer qué dice el
    // motor que tiene que pasar. Y la de CLAUDE.md §7: la corrección se escribe
    // al lado y no se borra el error.
    const { m, d, t, gurukk, disparos, deMapa, paso } = bosque();
    d.empezar(deMapa("Ghostturn"));
    m.mandarA(gurukk, { origen: [gurukk.donde[0] * m.U + 400, gurukk.donde[1] * m.U, gurukk.donde[2] * m.U], proximidad: 5 });
    t.v += 0.15;
    d.paso();
    m.pararDeAndar(gurukk, { avisar: false });
    disparos.length = 0;
    d.diario.length = 0;
    // Y otra vez, entera.
    d.empezar(deMapa("Ghostturn"));
    paso(0.05, gurukk);
    paso(0.1, gurukk);
    paso(0.1, gurukk);
    assert.ok(!d.diario.some((x) => x.que === "espera"),
      "ya no espera su `firedelay`: `m_EarlyBreak` sigue puesto");
    assert.ok(d.diario.some((x) => x.que === "acaba"), "la escena SÍ se ha completado");
    assert.deepEqual(disparos.map((x) => x.n), [],
      "y aun así no dispara nada: busca el `fireonbreak` que esta escena no tiene");
    // El control positivo, que es lo que separa «este fallo» de «el disparo no
    // funciona»: una escena sin cortar, recién empezada, sí dispara.
    const limpio = bosque();
    limpio.d.empezar(limpio.deMapa("Ghostturn"));
    limpio.paso(0.05, limpio.gurukk);
    limpio.paso(0.1, limpio.gurukk);
    limpio.paso(0.1, limpio.gurukk);
    const cuando = limpio.d.censo()[0].cuando;
    while (limpio.t.v < cuando + 0.05) limpio.paso(0.05, limpio.gurukk);
    assert.deepEqual(limpio.disparos.map((x) => x.n), ["SkeletonVanish"]);
  });
});
